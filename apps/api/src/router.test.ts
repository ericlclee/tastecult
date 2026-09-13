import { createTestPrismaClient, resetDatabase } from '@tastecult/db/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createCaller } from './router';

const prisma = createTestPrismaClient();
const api = createCaller({ prisma });

// King's Cross; "100% Burgers" is ~0.7 km away, Soho ~2.5 km, Shoreditch ~3.5 km
const kingsCross = { lat: 51.5355, lng: -0.125 };

let ids: Awaited<ReturnType<typeof seed>>;

async function seed() {
  const base = {
    businessType: 'Restaurant/Cafe/Canteen',
    businessTypeId: 1,
    localAuthority: 'Camden',
  };
  await prisma.restaurant.createMany({
    data: [
      {
        ...base,
        fhrsId: 1,
        name: 'Dishoom',
        latitude: 51.5355,
        longitude: -0.125,
        postcode: 'N1C 4AB',
      },
      { ...base, fhrsId: 2, name: 'Dishoom Shoreditch', latitude: 51.5245, longitude: -0.0769 },
      { ...base, fhrsId: 3, name: 'Pizza Pilgrims', latitude: 51.5134, longitude: -0.134 },
      {
        ...base,
        fhrsId: 4,
        name: 'Dishoom Closed',
        latitude: 51.5356,
        longitude: -0.1251,
        closedAt: new Date('2026-01-01'),
      },
      { ...base, fhrsId: 5, name: 'Dishoom Pop-up' },
      { ...base, fhrsId: 6, name: '100% Burgers', latitude: 51.53, longitude: -0.12 },
    ],
  });
  const restaurants = await prisma.restaurant.findMany({ select: { id: true, fhrsId: true } });
  const restaurantId = (fhrsId: number) => restaurants.find((r) => r.fhrsId === fhrsId)!.id;

  const cuisine = (slug: string, name: string, region: string, macroRegion: string) =>
    prisma.cuisine.create({ data: { slug, name, region, macroRegion } });
  const italian = await cuisine('italian', 'Italian', 'Southern European', 'European');
  const middleEastern = await cuisine(
    'middle-eastern',
    'Middle Eastern',
    'Middle Eastern',
    'Middle Eastern & African',
  );
  const northAfrican = await cuisine(
    'north-african',
    'North African',
    'African',
    'Middle Eastern & African',
  );

  const pizza = await prisma.dish.create({
    data: {
      slug: 'pizza',
      name: 'Pizza',
      popularity: 46051,
      cuisines: { create: [{ cuisineId: italian.id }] },
    },
  });
  const margherita = await prisma.dish.create({
    data: {
      slug: 'pizza-margherita',
      name: 'Pizza Margherita',
      popularity: 93,
      otherNames: ['Margherita'],
      parentId: pizza.id,
      cuisines: { create: [{ cuisineId: italian.id }] },
    },
  });
  const hummus = await prisma.dish.create({
    data: {
      slug: 'hummus',
      name: 'Hummus',
      popularity: 3531,
      otherNames: ['Houmous', 'Hommus'],
      cuisines: { create: [{ cuisineId: northAfrican.id }, { cuisineId: middleEastern.id }] },
    },
  });
  // A user-requested dish: must stay out of public search and lookups
  const pending = await prisma.dish.create({
    data: {
      slug: 'pizza-al-taglio-requested',
      name: 'Pizza al taglio',
      status: 'PENDING',
      parentId: pizza.id,
      cuisines: { create: [{ cuisineId: italian.id }] },
    },
  });

  return {
    dishoom: restaurantId(1),
    italian: italian.id,
    middleEastern: middleEastern.id,
    pizza: pizza.id,
    margherita: margherita.id,
    hummus: hummus.id,
    pending: pending.id,
  };
}

beforeAll(async () => {
  await resetDatabase(prisma);
  ids = await seed();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('health', () => {
  it('reports that the database is reachable', async () => {
    expect(await api.health()).toEqual({ ok: true });
  });
});

describe('cuisine.list', () => {
  it('orders by macro region then region, counting only approved dishes', async () => {
    const cuisines = await api.cuisine.list();

    expect(cuisines.map((c) => [c.slug, c.dishCount])).toEqual([
      ['italian', 2],
      ['north-african', 1],
      ['middle-eastern', 1],
    ]);
  });
});

describe('restaurant.search', () => {
  it('finds fuzzy matches among open restaurants, best match first', async () => {
    const results = await api.restaurant.search({ q: 'dishom' });
    const names = results.map((r) => r.name);

    expect(names[0]).toBe('Dishoom');
    expect(names).toEqual(expect.arrayContaining(['Dishoom Shoreditch', 'Dishoom Pop-up']));
    expect(names).not.toContain('Dishoom Closed');
  });

  it('finds short substrings that fuzzy matching misses', async () => {
    const results = await api.restaurant.search({ q: 'pi' });
    expect(results.map((r) => r.name)).toContain('Pizza Pilgrims');
  });

  it('adds distance when a location is given', async () => {
    const results = await api.restaurant.search({ q: 'dishoom', near: kingsCross });

    expect(results.find((r) => r.name === 'Dishoom')?.distanceKm).toBeCloseTo(0, 3);
    expect(results.find((r) => r.name === 'Dishoom Pop-up')?.distanceKm).toBeNull();
  });

  it('treats LIKE wildcards in the query literally', async () => {
    expect(await api.restaurant.search({ q: '%%' })).toEqual([]);
  });

  it('rejects one-character queries', async () => {
    await expect(api.restaurant.search({ q: 'd' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});

describe('restaurant.nearby', () => {
  it('returns open restaurants with coordinates inside the radius, nearest first', async () => {
    const results = await api.restaurant.nearby({ ...kingsCross, radiusKm: 3 });

    expect(results.map((r) => r.name)).toEqual(['Dishoom', '100% Burgers', 'Pizza Pilgrims']);
    expect(results[2]?.distanceKm).toBeCloseTo(2.53, 1);
  });

  it('respects a small radius', async () => {
    const results = await api.restaurant.nearby({ ...kingsCross, radiusKm: 0.5 });
    expect(results.map((r) => r.name)).toEqual(['Dishoom']);
  });
});

describe('restaurant.byId', () => {
  it('returns the restaurant', async () => {
    const restaurant = await api.restaurant.byId({ id: ids.dishoom });
    expect(restaurant).toMatchObject({
      fhrsId: 1,
      name: 'Dishoom',
      postcode: 'N1C 4AB',
      menuItems: [],
    });
  });

  it('throws NOT_FOUND for an unknown id', async () => {
    await expect(api.restaurant.byId({ id: 'missing' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

describe('dish.search', () => {
  it('matches other names and includes parent and cuisines', async () => {
    const results = await api.dish.search({ q: 'margarita' });

    expect(results[0]).toMatchObject({
      slug: 'pizza-margherita',
      parent: { slug: 'pizza' },
      cuisines: [{ slug: 'italian' }],
    });
  });

  it('lists every cuisine of a multi-cuisine dish, sorted by name', async () => {
    const [hummus] = await api.dish.search({ q: 'houmous' });
    expect(hummus?.cuisines.map((c) => c.name)).toEqual(['Middle Eastern', 'North African']);
  });

  it('puts the closest match first and excludes requested dishes', async () => {
    const results = await api.dish.search({ q: 'pizza' });
    expect(results.map((r) => r.slug)).toEqual(['pizza', 'pizza-margherita']);
  });

  it('filters by cuisine', async () => {
    expect(await api.dish.search({ q: 'pizza', cuisineId: ids.middleEastern })).toEqual([]);
    expect(
      (await api.dish.search({ q: 'hummus', cuisineId: ids.middleEastern })).map((r) => r.slug),
    ).toEqual(['hummus']);
  });
});

describe('dish.byId', () => {
  it('returns cuisines and approved variants only', async () => {
    const pizza = await api.dish.byId({ id: ids.pizza });

    expect(pizza).toMatchObject({
      slug: 'pizza',
      parent: null,
      cuisines: [{ slug: 'italian', region: 'Southern European', macroRegion: 'European' }],
      variants: [{ slug: 'pizza-margherita' }],
      variantCount: 1,
    });
  });

  it('hides requested dishes', async () => {
    await expect(api.dish.byId({ id: ids.pending })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
