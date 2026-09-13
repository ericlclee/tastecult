import { describe, expect, it } from 'vitest';
import { mentions, sourceRow } from './test-fixtures.js';
import { buildCatalogue } from './transform.js';

const dishBySlug = (catalogue: ReturnType<typeof buildCatalogue>, slug: string) =>
  catalogue.dishes.find((d) => d.slug === slug);

describe('buildCatalogue — merging country versions', () => {
  it('merges same-name rows into the unsuffixed entry', () => {
    const catalogue = buildCatalogue(
      [
        sourceRow({
          dish_id: 'hummus-egypt',
          dish: 'Hummus',
          cuisine: 'North African',
          cuisine_region: 'African',
        }),
        sourceRow({ dish_id: 'hummus', dish: 'Hummus' }),
        sourceRow({ dish_id: 'hummus-iraq', dish: 'Hummus' }),
      ],
      mentions({ 'hummus-egypt': 3531, hummus: 3531, 'hummus-iraq': 3531 }),
    );

    expect(catalogue.dishes).toHaveLength(1);
    expect(catalogue.dishes[0]).toMatchObject({
      slug: 'hummus',
      name: 'Hummus',
      cuisineSlugs: ['middle-eastern', 'north-african'],
      popularity: 3531,
      sourceIds: ['hummus', 'hummus-egypt', 'hummus-iraq'],
    });
  });

  it('gives a merged dish every cuisine its versions have', () => {
    const catalogue = buildCatalogue(
      [
        sourceRow({
          dish_id: 'labneh-egypt',
          dish: 'Labneh',
          cuisine: 'North African',
          cuisine_region: 'African',
        }),
        sourceRow({
          dish_id: 'sakoulas-greece',
          dish: 'Labneh',
          cuisine: 'Greek',
          cuisine_region: 'Southern European',
          cuisine_macro: 'European',
        }),
        sourceRow({ dish_id: 'labneh-lebanon', dish: 'Labneh' }),
        sourceRow({ dish_id: 'labneh-syria', dish: 'Labneh' }),
        sourceRow({ dish_id: 'sakoulas-cyprus', dish: 'Labneh' }),
      ],
      mentions({
        'labneh-egypt': 170,
        'sakoulas-greece': 170,
        'labneh-lebanon': 170,
        'labneh-syria': 170,
        'sakoulas-cyprus': 170,
      }),
    );

    expect(catalogue.dishes[0]).toMatchObject({
      slug: 'labneh',
      cuisineSlugs: ['greek', 'middle-eastern', 'north-african'],
      popularity: 170,
    });
  });

  it('takes category from the most-mentioned version when there is no unsuffixed entry', () => {
    const catalogue = buildCatalogue(
      [
        sourceRow({
          dish_id: 'labneh-egypt',
          dish: 'Labneh',
          cuisine: 'North African',
          cuisine_region: 'African',
        }),
        sourceRow({ dish_id: 'labneh-lebanon', dish: 'Labneh', category: 'Spread' }),
      ],
      mentions({ 'labneh-egypt': 5, 'labneh-lebanon': 100 }),
    );

    expect(catalogue.dishes[0]).toMatchObject({
      slug: 'labneh',
      category: 'Spread',
      cuisineSlugs: ['middle-eastern', 'north-african'],
      popularity: 100,
    });
  });

  it("falls back to a source id instead of taking another dish's slug", () => {
    const catalogue = buildCatalogue(
      [
        sourceRow({ dish_id: 'haleem', dish: 'Haleem (stew)' }),
        sourceRow({ dish_id: 'haleem-pakistan', dish: 'Haleem' }),
        sourceRow({ dish_id: 'haleem-bangladesh', dish: 'Haleem' }),
      ],
      mentions({ 'haleem-pakistan': 50, 'haleem-bangladesh': 10 }),
    );

    expect(catalogue.dishes.map((d) => d.slug).sort()).toEqual([
      'haleem-bangladesh',
      'haleem-stew',
    ]);
  });

  it('keeps slugs stable when mention counts change', () => {
    const rows = [
      sourceRow({ dish_id: 'humita', dish: 'Humita (Ecuador)' }),
      sourceRow({
        dish_id: 'humita-peru',
        dish: 'Humita',
        cuisine: 'Peruvian',
        cuisine_region: 'Latin American',
      }),
      sourceRow({ dish_id: 'humita-chile', dish: 'Humita' }),
      sourceRow({ dish_id: 'humita-bolivia', dish: 'Humita' }),
    ];
    const slugs = (counts: Record<string, number>) =>
      buildCatalogue(rows, mentions(counts))
        .dishes.map((d) => d.slug)
        .sort();

    const before = slugs({ 'humita-peru': 500 });
    const after = slugs({ 'humita-chile': 900, 'humita-bolivia': 10 });

    expect(before).toEqual(['humita-bolivia', 'humita-ecuador']);
    expect(after).toEqual(before);
  });

  it('uses the source id when a name has no Latin characters to slugify', () => {
    const catalogue = buildCatalogue(
      [sourceRow({ dish_id: 'bun-cha', dish: 'บุนชา' })],
      mentions({}),
    );
    expect(catalogue.dishes[0]?.slug).toBe('bun-cha');
  });

  it('combines other names across versions and drops invisible marks and duplicates', () => {
    const catalogue = buildCatalogue(
      [
        sourceRow({
          dish_id: 'bolani',
          dish: 'Bolani',
          other_names: 'بولانی\u200E, Perakai, Bolani',
        }),
        sourceRow({ dish_id: 'bolani-pakistan', dish: 'Bolani', other_names: 'perakai, Poraki' }),
      ],
      mentions({}),
    );

    expect(catalogue.dishes[0]?.otherNames).toEqual(['بولانی', 'Perakai', 'Poraki']);
  });

  it('splits ingredients, falling back to another version when the main one has none', () => {
    const catalogue = buildCatalogue(
      [
        sourceRow({ dish_id: 'burger', dish: 'Burger', ingredients: 'Beef; Burger Bun; ;Onion' }),
        sourceRow({ dish_id: 'kofta', dish: 'Kofta', ingredients: '' }),
        sourceRow({ dish_id: 'kofta-turkey', dish: 'Kofta', ingredients: 'Lamb; Onion' }),
      ],
      mentions({}),
    );

    expect(dishBySlug(catalogue, 'burger')?.ingredients).toEqual(['Beef', 'Burger Bun', 'Onion']);
    expect(dishBySlug(catalogue, 'kofta')?.ingredients).toEqual(['Lamb', 'Onion']);
  });

  it('takes popularity from London mentions only, defaulting to zero', () => {
    const catalogue = buildCatalogue(
      [sourceRow({ dish_id: 'poutine', dish: 'Poutine' })],
      mentions({}),
    );
    expect(catalogue.dishes[0]?.popularity).toBe(0);
  });
});

describe('buildCatalogue — variants', () => {
  it('links variants to their parent, including parents built from merged rows', () => {
    const catalogue = buildCatalogue(
      [
        sourceRow({
          dish_id: 'pizza',
          dish: 'Pizza',
          cuisine: 'Italian',
          cuisine_region: 'Southern European',
          cuisine_macro: 'European',
        }),
        sourceRow({
          dish_id: 'pizza-margherita',
          dish: 'Pizza Margherita',
          group_of: 'Pizza',
          cuisine: 'Italian',
          cuisine_region: 'Southern European',
          cuisine_macro: 'European',
        }),
        sourceRow({ dish_id: 'hummus-egypt', dish: 'Hummus' }),
        sourceRow({ dish_id: 'hummus-with-meat', dish: 'Hummus with meat', group_of: 'Hummus' }),
      ],
      mentions({ 'hummus-egypt': 10 }),
    );

    expect(dishBySlug(catalogue, 'pizza')?.parentSlug).toBeNull();
    expect(dishBySlug(catalogue, 'pizza-margherita')?.parentSlug).toBe('pizza');
    expect(dishBySlug(catalogue, 'hummus-with-meat')?.parentSlug).toBe('hummus');
  });

  it('follows chains to the root parent and leaves cycles unparented', () => {
    const catalogue = buildCatalogue(
      [
        sourceRow({ dish_id: 'a', dish: 'Aaa', group_of: 'Bbb' }),
        sourceRow({ dish_id: 'b', dish: 'Bbb', group_of: 'Ccc' }),
        sourceRow({ dish_id: 'c', dish: 'Ccc' }),
        sourceRow({ dish_id: 'x', dish: 'Xxx', group_of: 'Yyy' }),
        sourceRow({ dish_id: 'y', dish: 'Yyy', group_of: 'Xxx' }),
      ],
      mentions({}),
    );

    expect(dishBySlug(catalogue, 'aaa')?.parentSlug).toBe('ccc');
    expect(dishBySlug(catalogue, 'bbb')?.parentSlug).toBe('ccc');
    expect(dishBySlug(catalogue, 'xxx')?.parentSlug).toBeNull();
    expect(dishBySlug(catalogue, 'yyy')?.parentSlug).toBeNull();
  });

  it('skips rows without a cuisine and reports variants whose parent was skipped', () => {
    const catalogue = buildCatalogue(
      [
        sourceRow({ dish_id: 'forszmak', dish: 'Forszmak', cuisine: '' }),
        sourceRow({
          dish_id: 'forszmak-lubelski',
          dish: 'Forszmak Lubelski',
          group_of: 'Forszmak',
        }),
      ],
      mentions({}),
    );

    expect(catalogue.skipped).toEqual([{ dishId: 'forszmak', reason: 'no cuisine' }]);
    expect(catalogue.dishes).toHaveLength(1);
    expect(catalogue.dishes[0]?.parentSlug).toBeNull();
    expect(catalogue.missingParents).toEqual(['forszmak']);
  });
});

describe('buildCatalogue — cuisines', () => {
  it('builds each cuisine once with its region hierarchy', () => {
    const catalogue = buildCatalogue(
      [
        sourceRow({
          dish_id: 'pad-thai',
          dish: 'Pad Thai',
          cuisine: 'Thai',
          cuisine_region: 'Southeast Asian',
          cuisine_macro: 'Asian',
        }),
        sourceRow({
          dish_id: 'som-tam',
          dish: 'Som Tam',
          cuisine: 'Thai',
          cuisine_region: 'Southeast Asian',
          cuisine_macro: 'Asian',
        }),
        sourceRow({
          dish_id: 'fish-and-chips',
          dish: 'Fish and chips',
          cuisine: 'British & Irish',
          cuisine_region: 'Western European',
          cuisine_macro: 'European',
        }),
      ],
      mentions({}),
    );

    expect(catalogue.cuisines).toEqual([
      {
        slug: 'british-and-irish',
        name: 'British & Irish',
        region: 'Western European',
        macroRegion: 'European',
      },
      { slug: 'thai', name: 'Thai', region: 'Southeast Asian', macroRegion: 'Asian' },
    ]);
  });

  it('rejects a cuisine mapped to two different regions', () => {
    expect(() =>
      buildCatalogue(
        [
          sourceRow({
            dish_id: 'a',
            dish: 'Aaa',
            cuisine: 'Thai',
            cuisine_region: 'Southeast Asian',
            cuisine_macro: 'Asian',
          }),
          sourceRow({
            dish_id: 'b',
            dish: 'Bbb',
            cuisine: 'Thai',
            cuisine_region: 'East Asian',
            cuisine_macro: 'Asian',
          }),
        ],
        mentions({}),
      ),
    ).toThrow(/more than one region/);
  });
});
