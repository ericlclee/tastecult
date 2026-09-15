import { createTestPrismaClient, resetDatabase } from '@tastecult/db/testing';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createCaller } from './router';
import { PUBLIC_LOG_PREVIEW } from './routers/rating';
import type { PhotoStorage } from './storage';

const prisma = createTestPrismaClient();

const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';

const storage: PhotoStorage = {
  createUploadUrl: async (path) => ({
    signedUrl: `https://storage.test/upload/${path}`,
    token: 't',
  }),
  publicUrl: (path) => `https://storage.test/public/${path}`,
  remove: async () => {},
};

type Api = ReturnType<typeof createCaller>;

function as(userId: string | null): Api {
  return createCaller({
    prisma,
    auth: userId ? { userId, email: `${userId.slice(0, 4)}@example.com` } : null,
    storage,
  });
}

async function withProfile(userId: string, username: string) {
  const api = as(userId);
  await api.user.createProfile({ username });
  return api;
}

let ids: Awaited<ReturnType<typeof seed>>;

async function seed() {
  await resetDatabase(prisma);
  const base = {
    businessType: 'Restaurant/Cafe/Canteen',
    businessTypeId: 1,
    localAuthority: 'Westminster',
  };
  const kanadaYa = await prisma.restaurant.create({
    data: { ...base, fhrsId: 1, name: 'Kanada-Ya' },
  });
  const pilgrims = await prisma.restaurant.create({
    data: { ...base, fhrsId: 2, name: 'Pizza Pilgrims' },
  });

  const cuisine = (slug: string, name: string) =>
    prisma.cuisine.create({ data: { slug, name, region: 'Region', macroRegion: 'Macro' } });
  const italian = await cuisine('italian', 'Italian');
  const japanese = await cuisine('japanese', 'Japanese');

  const pizza = await prisma.dish.create({
    data: { slug: 'pizza', name: 'Pizza', cuisines: { create: [{ cuisineId: italian.id }] } },
  });
  const margherita = await prisma.dish.create({
    data: {
      slug: 'pizza-margherita',
      name: 'Pizza Margherita',
      parentId: pizza.id,
      cuisines: { create: [{ cuisineId: italian.id }] },
    },
  });
  const ramen = await prisma.dish.create({
    data: { slug: 'ramen', name: 'Ramen', cuisines: { create: [{ cuisineId: japanese.id }] } },
  });

  return {
    kanadaYa: kanadaYa.id,
    pilgrims: pilgrims.id,
    italian: italian.id,
    pizza: pizza.id,
    margherita: margherita.id,
    ramen: ramen.id,
  };
}

beforeEach(async () => {
  ids = await seed();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('rating.forDish', () => {
  it("shows everyone's logs of a dish and its variants, newest first, with authors", async () => {
    const alice = await withProfile(ALICE, 'alice');
    const bob = await withProfile(BOB, 'bob');
    await alice.rating.create({
      restaurantId: ids.pilgrims,
      dishId: ids.margherita,
      tier: 5,
      visitedAt: '2026-03-01',
    });
    await bob.rating.create({
      restaurantId: ids.pilgrims,
      dishId: ids.pizza,
      tier: 3,
      visitedAt: '2026-02-01',
    });
    await alice.rating.create({
      restaurantId: ids.kanadaYa,
      dishId: ids.ramen,
      tier: 4,
      visitedAt: '2026-04-01',
    });

    const pizzaPage = await as(null).rating.forDish({ dishId: ids.pizza });

    expect(pizzaPage.items.map((log) => [log.menuItem.dish.name, log.user.username])).toEqual([
      ['Pizza Margherita', 'alice'],
      ['Pizza', 'bob'],
    ]);
    expect(pizzaPage).toMatchObject({
      summary: { logCount: 2, peopleCount: 2 },
      limited: false,
      nextCursor: null,
    });

    const margheritaPage = await as(null).rating.forDish({ dishId: ids.margherita });
    expect(margheritaPage.items.map((log) => log.menuItem.dish.name)).toEqual(['Pizza Margherita']);
  });
});

describe('rating.forRestaurant', () => {
  it('gives signed-out visitors a preview and signed-in people the full list', async () => {
    const alice = await withProfile(ALICE, 'alice');
    for (const day of ['01', '02', '03', '04', '05']) {
      await alice.rating.create({
        restaurantId: ids.kanadaYa,
        dishId: ids.ramen,
        tier: 4,
        visitedAt: `2026-01-${day}`,
      });
    }

    const preview = await as(null).rating.forRestaurant({ restaurantId: ids.kanadaYa });
    expect(preview.items.map((log) => log.visitedAt)).toEqual([
      '2026-01-05',
      '2026-01-04',
      '2026-01-03',
    ]);
    expect(preview.items).toHaveLength(PUBLIC_LOG_PREVIEW);
    expect(preview).toMatchObject({ limited: true, nextCursor: null, summary: { logCount: 5 } });

    // A cursor doesn't let a signed-out visitor page past the preview
    const sneaky = await as(null).rating.forRestaurant({
      restaurantId: ids.kanadaYa,
      cursor: preview.items[2]!.id,
    });
    expect(sneaky.items.map((log) => log.visitedAt)).toEqual(
      preview.items.map((log) => log.visitedAt),
    );

    // Signed in is enough — no username needed just to read
    const bob = as(BOB);
    const dates: string[] = [];
    let cursor: string | null = null;
    do {
      const page = await bob.rating.forRestaurant({ restaurantId: ids.kanadaYa, limit: 2, cursor });
      expect(page.limited).toBe(false);
      dates.push(...page.items.map((log) => log.visitedAt));
      cursor = page.nextCursor;
    } while (cursor);
    expect(dates).toEqual(['2026-01-05', '2026-01-04', '2026-01-03', '2026-01-02', '2026-01-01']);
  });

  it("counts each person's latest log of each menu item in the tier breakdown", async () => {
    const alice = await withProfile(ALICE, 'alice');
    const bob = await withProfile(BOB, 'bob');
    const log = (api: Api, tier: number, visitedAt: string, alias?: string) =>
      api.rating.create({ restaurantId: ids.kanadaYa, dishId: ids.ramen, tier, visitedAt, alias });

    await log(alice, 2, '2026-01-01');
    await log(alice, 5, '2026-02-01'); // replaces her earlier Fine in the breakdown
    await log(bob, 4, '2026-01-15');
    await log(alice, 1, '2026-01-20', 'Spicy miso ramen'); // a different menu item

    const { summary } = await as(null).rating.forRestaurant({ restaurantId: ids.kanadaYa });

    expect(summary).toEqual({
      logCount: 4,
      peopleCount: 2,
      tierCounts: { 1: 1, 2: 0, 3: 0, 4: 1, 5: 1 },
    });
  });

  it('shows logs of a requested dish only to the person who requested it', async () => {
    const alice = await withProfile(ALICE, 'alice');
    const bob = await withProfile(BOB, 'bob');
    const { dish } = await bob.dish.request({ name: 'Pizza al taglio', cuisineId: ids.italian });
    await bob.rating.create({ restaurantId: ids.pilgrims, dishId: dish.id, tier: 4 });
    await alice.rating.create({ restaurantId: ids.pilgrims, dishId: ids.pizza, tier: 3 });

    const names = async (api: Api) =>
      (await api.rating.forRestaurant({ restaurantId: ids.pilgrims })).items.map(
        (log) => log.menuItem.dish.name,
      );

    expect(await names(bob)).toEqual(expect.arrayContaining(['Pizza al taglio', 'Pizza']));
    expect(await names(alice)).toEqual(['Pizza']);
    expect(await names(as(null))).toEqual(['Pizza']);
    expect(
      (await alice.rating.forRestaurant({ restaurantId: ids.pilgrims })).summary.logCount,
    ).toBe(1);
  });
});

describe('not found', () => {
  it("rejects unknown restaurants and dishes, and someone else's requested dish", async () => {
    const bob = await withProfile(BOB, 'bob');
    const { dish } = await bob.dish.request({ name: 'Pizza al taglio', cuisineId: ids.italian });

    await expect(as(null).rating.forRestaurant({ restaurantId: 'missing' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(as(null).rating.forDish({ dishId: 'missing' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(as(ALICE).rating.forDish({ dishId: dish.id })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(bob.rating.forDish({ dishId: dish.id })).resolves.toMatchObject({
      summary: { logCount: 0 },
    });
  });
});
