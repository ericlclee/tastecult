import { createTestPrismaClient, resetDatabase } from '@tastecult/db/testing';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { importCatalogue } from './import.js';
import { mentions, sourceRow } from './test-fixtures.js';
import { buildCatalogue } from './transform.js';

const prisma = createTestPrismaClient();

const italian = {
  cuisine: 'Italian',
  cuisine_region: 'Southern European',
  cuisine_macro: 'European',
};

function catalogue(
  overrides: {
    margheritaParent?: string;
    pizzaMentions?: number;
    withoutHummusEgypt?: boolean;
  } = {},
) {
  const rows = [
    sourceRow({
      dish_id: 'pizza',
      dish: 'Pizza',
      category: 'Pizza',
      ingredients: 'Dough; Tomato',
      ...italian,
    }),
    sourceRow({
      dish_id: 'pizza-margherita',
      dish: 'Pizza Margherita',
      group_of: overrides.margheritaParent ?? 'Pizza',
      other_names: 'Margherita',
      ...italian,
    }),
    sourceRow({ dish_id: 'hummus', dish: 'Hummus' }),
    sourceRow({
      dish_id: 'hummus-egypt',
      dish: 'Hummus',
      cuisine: 'North African',
      cuisine_region: 'African',
    }),
  ];
  return buildCatalogue(
    overrides.withoutHummusEgypt ? rows.filter((r) => r.dish_id !== 'hummus-egypt') : rows,
    mentions({ pizza: overrides.pizzaMentions ?? 46051, hummus: 3531 }),
  );
}

async function dishes() {
  return prisma.dish.findMany({
    include: { cuisines: { include: { cuisine: true } }, parent: true },
    orderBy: { slug: 'asc' },
  });
}

const cuisineSlugs = (dish: { cuisines: { cuisine: { slug: string } }[] } | undefined) =>
  dish?.cuisines.map((c) => c.cuisine.slug).sort();

beforeEach(async () => {
  await resetDatabase(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('importCatalogue', () => {
  it('imports cuisines and dishes with parent links', async () => {
    const result = await importCatalogue(prisma, catalogue());

    // Middle Eastern, Italian, and North African (from the merged hummus-egypt row)
    expect(result).toEqual({
      cuisines: 3,
      dishesWritten: 3,
      dishesConflicting: 0,
      parentLinksChanged: 1,
      // pizza + margherita -> Italian, hummus -> Middle Eastern and North African
      cuisineLinksChanged: 4,
      staleDishes: 0,
    });

    const rows = await dishes();
    expect(rows.map((d) => d.slug)).toEqual(['hummus', 'pizza', 'pizza-margherita']);

    const [hummus, pizza, margherita] = rows;
    expect(hummus).toMatchObject({ status: 'APPROVED', popularity: 3531, parentId: null });
    expect(cuisineSlugs(hummus)).toEqual(['middle-eastern', 'north-african']);
    expect(cuisineSlugs(pizza)).toEqual(['italian']);
    expect(pizza).toMatchObject({
      category: 'Pizza',
      ingredients: ['Dough', 'Tomato'],
      popularity: 46051,
    });
    expect(margherita?.parent?.slug).toBe('pizza');
    expect(margherita?.otherNames).toEqual(['Margherita']);
  });

  it('is idempotent: re-importing keeps ids and changes no parent links', async () => {
    await importCatalogue(prisma, catalogue());
    const before = await dishes();

    const result = await importCatalogue(prisma, catalogue());

    expect(result.parentLinksChanged).toBe(0);
    expect(result.cuisineLinksChanged).toBe(0);
    const after = await dishes();
    expect(after.map((d) => [d.slug, d.id])).toEqual(before.map((d) => [d.slug, d.id]));
    expect(await prisma.cuisine.count()).toBe(3);
  });

  it('updates changed fields and parent links on re-import', async () => {
    await importCatalogue(prisma, catalogue());

    const result = await importCatalogue(
      prisma,
      catalogue({ margheritaParent: 'Pizza Margherita', pizzaMentions: 50000 }),
    );

    expect(result.parentLinksChanged).toBe(1);
    const [, pizza, margherita] = await dishes();
    expect(pizza?.popularity).toBe(50000);
    expect(margherita?.parentId).toBeNull();
  });

  it('removes a cuisine link when that version leaves the catalogue', async () => {
    await importCatalogue(prisma, catalogue());

    const result = await importCatalogue(prisma, catalogue({ withoutHummusEgypt: true }));

    expect(result.cuisineLinksChanged).toBe(1);
    const [hummus] = await dishes();
    expect(cuisineSlugs(hummus)).toEqual(['middle-eastern']);
    // Only the link goes; the cuisine itself is kept
    expect(await prisma.cuisine.findUnique({ where: { slug: 'north-african' } })).not.toBeNull();
  });

  it('reports approved dishes missing from the catalogue without deleting them', async () => {
    await importCatalogue(prisma, catalogue());

    const withoutHummus = catalogue();
    withoutHummus.dishes = withoutHummus.dishes.filter((d) => d.slug !== 'hummus');
    const result = await importCatalogue(prisma, withoutHummus);

    expect(result.staleDishes).toBe(1);
    expect(await prisma.dish.findUnique({ where: { slug: 'hummus' } })).not.toBeNull();
  });

  it('never overwrites a user-requested dish that has the same slug', async () => {
    const cuisine = await prisma.cuisine.create({
      data: {
        slug: 'greek',
        name: 'Greek',
        region: 'Southern European',
        macroRegion: 'European',
      },
    });
    await prisma.dish.create({
      data: {
        slug: 'pizza',
        name: 'Pizza (requested)',
        status: 'PENDING',
        cuisines: { create: { cuisineId: cuisine.id } },
      },
    });

    const result = await importCatalogue(prisma, catalogue());

    expect(result.dishesConflicting).toBe(1);
    const pizza = await prisma.dish.findUniqueOrThrow({ where: { slug: 'pizza' } });
    expect(pizza).toMatchObject({ name: 'Pizza (requested)', status: 'PENDING' });
    // Its cuisine links aren't synced to the catalogue's (Italian) either
    const pendingLinks = await prisma.dishCuisine.findMany({
      where: { dishId: pizza.id },
      include: { cuisine: true },
    });
    expect(pendingLinks.map((l) => l.cuisine.slug)).toEqual(['greek']);
    // A pending dish isn't a valid parent for catalogue variants
    const margherita = await prisma.dish.findUniqueOrThrow({ where: { slug: 'pizza-margherita' } });
    expect(margherita.parentId).toBeNull();
  });

  it('rolls back everything when the import fails part-way', async () => {
    const broken = catalogue();
    broken.dishes[0]!.cuisineSlugs = ['does-not-exist'];

    await expect(importCatalogue(prisma, broken)).rejects.toThrow(/unknown cuisine/);

    expect(await prisma.cuisine.count()).toBe(0);
    expect(await prisma.dish.count()).toBe(0);
  });
});
