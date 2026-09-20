import { randomUUID } from 'node:crypto';
import { createTestPrismaClient, resetDatabase } from '@tastecult/db/testing';
import { londonDateString } from '@tastecult/shared-types';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createCaller } from './router';
import type { PhotoStorage } from './storage';

const prisma = createTestPrismaClient();

const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';

// Stands in for Supabase Storage: the upload itself happens between the app and Supabase
const storage: PhotoStorage = {
  createUploadUrl: async (path) => ({
    signedUrl: `https://storage.test/upload/${path}?token=abc`,
    token: 'abc',
  }),
  publicUrl: (path) => `https://storage.test/public/${path}`,
  remove: async () => {},
};

function as(userId: string | null, options: { storage?: PhotoStorage | null } = {}) {
  return createCaller({
    prisma,
    auth: userId ? { userId, email: `${userId.slice(0, 4)}@example.com` } : null,
    storage: options.storage === undefined ? storage : options.storage,
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
  const restaurant = await prisma.restaurant.create({
    data: {
      fhrsId: 1,
      name: 'Kanada-Ya',
      businessType: 'Restaurant/Cafe/Canteen',
      businessTypeId: 1,
      localAuthority: 'Westminster',
      latitude: 51.51,
      longitude: -0.13,
    },
  });
  const japanese = await prisma.cuisine.create({
    data: { slug: 'japanese', name: 'Japanese', region: 'East Asian', macroRegion: 'Asian' },
  });
  const italian = await prisma.cuisine.create({
    data: {
      slug: 'italian',
      name: 'Italian',
      region: 'Southern European',
      macroRegion: 'European',
    },
  });
  const ramen = await prisma.dish.create({
    data: {
      slug: 'ramen',
      name: 'Ramen',
      popularity: 3494,
      cuisines: { create: [{ cuisineId: japanese.id }] },
    },
  });
  return { restaurant: restaurant.id, japanese: japanese.id, italian: italian.id, ramen: ramen.id };
}

beforeEach(async () => {
  ids = await seed();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('profiles', () => {
  it('requires sign-in', async () => {
    await expect(as(null).user.me()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('reports no profile until one is created', async () => {
    const alice = as(ALICE);
    expect(await alice.user.me()).toMatchObject({ userId: ALICE, profile: null });

    await alice.user.createProfile({ username: 'alice' });

    expect(await alice.user.me()).toMatchObject({ profile: { username: 'alice' } });
  });

  it('rejects a taken username, a second profile and an invalid username', async () => {
    await withProfile(ALICE, 'alice');

    await expect(as(BOB).user.createProfile({ username: 'alice' })).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'That username is taken',
    });
    await expect(as(ALICE).user.createProfile({ username: 'alice2' })).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    await expect(as(BOB).user.createProfile({ username: 'Not Valid' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });
});

describe('photo.createUploadUrl', () => {
  it('hands out an upload URL for a new photo in your own folder', async () => {
    const alice = await withProfile(ALICE, 'alice');

    const upload = await alice.photo.createUploadUrl();

    expect(upload.path).toMatch(new RegExp(`^${ALICE}/[0-9a-f-]{36}\\.jpg$`));
    expect(upload.publicUrl).toBe(`https://storage.test/public/${upload.path}`);
    expect(upload.signedUrl).toContain(upload.path);
  });

  it('needs a profile', async () => {
    await expect(as(ALICE).photo.createUploadUrl()).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
    });
  });

  it('says so when uploads are not configured', async () => {
    await withProfile(ALICE, 'alice');
    await expect(as(ALICE, { storage: null }).photo.createUploadUrl()).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Photo uploads are not configured on this server',
    });
  });
});

describe('visit.create', () => {
  it('saves a full visit with a photo and returns it ready to display', async () => {
    const alice = await withProfile(ALICE, 'alice');
    const upload = await alice.photo.createUploadUrl();

    const visit = await alice.visit.create({
      restaurantId: ids.restaurant,
      note: '  Great meal  ',
      dishes: [
        {
          dishId: ids.ramen,
          tier: 5,
          alias: 'Tonkotsu ramen',
          note: '  Rich broth  ',
          cuisineId: ids.japanese,
        },
      ],
      photos: [{ path: upload.path, dishIndex: 0 }],
    });

    expect(visit).toMatchObject({
      note: 'Great meal',
      visitedAt: londonDateString(),
      restaurant: { name: 'Kanada-Ya' },
      photos: [{ path: upload.path, url: upload.publicUrl, dishIndex: 0 }],
    });
    expect(visit.dishes).toHaveLength(1);
    expect(visit.dishes[0]).toMatchObject({
      tier: 5,
      note: 'Rich broth',
      photoUrl: upload.publicUrl,
      cuisine: { slug: 'japanese' },
      menuItem: {
        alias: 'Tonkotsu ramen',
        restaurant: { name: 'Kanada-Ya' },
        dish: { name: 'Ramen', status: 'APPROVED' },
      },
    });
  });

  it('logs several dishes on one visit, each with its own tier and note', async () => {
    const alice = await withProfile(ALICE, 'alice');
    const gyoza = await prisma.dish.create({ data: { slug: 'gyoza', name: 'Gyoza' } });

    const visit = await alice.visit.create({
      restaurantId: ids.restaurant,
      dishes: [
        { dishId: ids.ramen, tier: 5, note: 'The reason to come' },
        { dishId: gyoza.id, tier: 3, alias: 'Pork gyoza' },
      ],
      photos: [],
    });

    // Dishes come back in the order they were sent
    expect(visit.dishes.map((dish) => [dish.menuItem.dish.name, dish.tier])).toEqual([
      ['Ramen', 5],
      ['Gyoza', 3],
    ]);
    // One visit, two logs, two menu items — and both logs share the visit's date
    expect(await prisma.visit.count()).toBe(1);
    expect(await prisma.rating.count()).toBe(2);
    expect(await prisma.menuItem.count()).toBe(2);
    expect(new Set(visit.dishes.map((dish) => dish.visitId)).size).toBe(1);
    expect(new Set(visit.dishes.map((dish) => dish.visitedAt))).toEqual(new Set([visit.visitedAt]));
  });

  it('keeps two separate visits to one restaurant on one day apart', async () => {
    const alice = await withProfile(ALICE, 'alice');
    const one = { restaurantId: ids.restaurant, visitedAt: '2026-02-01', photos: [] };

    const lunch = await alice.visit.create({ ...one, dishes: [{ dishId: ids.ramen, tier: 4 }] });
    const dinner = await alice.visit.create({ ...one, dishes: [{ dishId: ids.ramen, tier: 2 }] });

    expect(lunch.id).not.toBe(dinner.id);
    expect(await prisma.visit.count()).toBe(2);
  });

  it('attaches photos to the whole visit or to one dish on it', async () => {
    const alice = await withProfile(ALICE, 'alice');
    const gyoza = await prisma.dish.create({ data: { slug: 'gyoza', name: 'Gyoza' } });
    const [table, ofGyoza] = await Promise.all([
      alice.photo.createUploadUrl(),
      alice.photo.createUploadUrl(),
    ]);

    const visit = await alice.visit.create({
      restaurantId: ids.restaurant,
      dishes: [
        { dishId: ids.ramen, tier: 4 },
        { dishId: gyoza.id, tier: 5 },
      ],
      photos: [
        { path: table.path, dishIndex: null },
        { path: ofGyoza.path, dishIndex: 1 },
      ],
    });

    expect(visit.photos.map((photo) => photo.dishIndex)).toEqual([null, 1]);
    // A photo of the visit as a whole isn't any single dish's photo
    expect(visit.dishes[0]!.photoUrl).toBeNull();
    expect(visit.dishes[1]!.photoUrl).toBe(ofGyoza.publicUrl);
  });

  it('rejects a photo pointing at a dish that is not on the visit', async () => {
    const alice = await withProfile(ALICE, 'alice');
    const upload = await alice.photo.createUploadUrl();

    await expect(
      alice.visit.create({
        restaurantId: ids.restaurant,
        dishes: [{ dishId: ids.ramen, tier: 4 }],
        photos: [{ path: upload.path, dishIndex: 3 }],
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('saves with only the required fields', async () => {
    const alice = await withProfile(ALICE, 'alice');

    const visit = await alice.visit.create({
      restaurantId: ids.restaurant,
      dishes: [{ dishId: ids.ramen, tier: 3 }],
      photos: [],
    });

    expect(visit).toMatchObject({ note: null, photos: [] });
    expect(visit.dishes[0]).toMatchObject({
      note: null,
      photoUrl: null,
      cuisine: null,
      menuItem: { alias: null },
    });
  });

  it('requires at least one dish', async () => {
    const alice = await withProfile(ALICE, 'alice');

    await expect(
      alice.visit.create({ restaurantId: ids.restaurant, dishes: [], photos: [] }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('reuses a menu item for the same menu name however it is typed', async () => {
    const alice = await withProfile(ALICE, 'alice');
    const log = (tier: number, alias?: string) =>
      alice.visit.create({
        restaurantId: ids.restaurant,
        dishes: [{ dishId: ids.ramen, tier, alias }],
        photos: [],
      });

    await log(4, 'Tonkotsu Ramen');
    await log(5, '  tonkotsu   ramen ');
    await log(3, 'Spicy miso ramen');
    await log(3);

    const items = await prisma.menuItem.findMany({ orderBy: { normalizedAlias: 'asc' } });
    expect(items.map((i) => i.alias)).toEqual([null, 'Spicy miso ramen', 'Tonkotsu Ramen']);
    expect(await prisma.rating.count()).toBe(4);
  });

  it('requires sign-in and a profile', async () => {
    const input = {
      restaurantId: ids.restaurant,
      dishes: [{ dishId: ids.ramen, tier: 4 }],
      photos: [],
    };
    await expect(as(null).visit.create(input)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(as(ALICE).visit.create(input)).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
    });
  });

  it("rejects someone else's photo or a made-up path", async () => {
    const alice = await withProfile(ALICE, 'alice');
    const input = {
      restaurantId: ids.restaurant,
      dishes: [{ dishId: ids.ramen, tier: 4 }],
    };

    await expect(
      alice.visit.create({ ...input, photos: [{ path: `${BOB}/${randomUUID()}.jpg` }] }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      alice.visit.create({ ...input, photos: [{ path: `${ALICE}/../${BOB}/photo.jpg` }] }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('accepts a past visit date and rejects a future one', async () => {
    const alice = await withProfile(ALICE, 'alice');
    const input = {
      restaurantId: ids.restaurant,
      dishes: [{ dishId: ids.ramen, tier: 4 }],
      photos: [],
    };

    const past = await alice.visit.create({ ...input, visitedAt: '2026-01-15' });
    expect(past.visitedAt).toBe('2026-01-15');
    expect(past.dishes[0]!.visitedAt).toBe('2026-01-15');

    const tomorrow = londonDateString(new Date(Date.now() + 36 * 60 * 60 * 1000));
    await expect(alice.visit.create({ ...input, visitedAt: tomorrow })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it('rejects unknown restaurants, dishes and cuisines, and tiers outside 1–5', async () => {
    const alice = await withProfile(ALICE, 'alice');
    const input = {
      restaurantId: ids.restaurant,
      dishes: [{ dishId: ids.ramen, tier: 4 }],
      photos: [],
    };

    await expect(alice.visit.create({ ...input, restaurantId: 'missing' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(
      alice.visit.create({ ...input, dishes: [{ dishId: 'missing', tier: 4 }] }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      alice.visit.create({ ...input, dishes: [{ dishId: ids.ramen, tier: 4, cuisineId: 'nope' }] }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(
      alice.visit.create({ ...input, dishes: [{ dishId: ids.ramen, tier: 6 }] }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});

describe('dish.request', () => {
  it('creates a pending dish its requester can log straight away, but nobody else can', async () => {
    const alice = await withProfile(ALICE, 'alice');
    const bob = await withProfile(BOB, 'bob');

    const { created, dish } = await alice.dish.request({
      name: '  Ramen   burger ',
      cuisineId: ids.japanese,
    });
    expect(created).toBe(true);
    expect(dish).toMatchObject({
      name: 'Ramen burger',
      status: 'PENDING',
      cuisines: [{ slug: 'japanese' }],
    });

    const input = {
      restaurantId: ids.restaurant,
      dishes: [{ dishId: dish.id, tier: 4 }],
      photos: [],
    };
    const logged = await alice.visit.create(input);
    expect(logged.dishes[0]!.menuItem.dish.status).toBe('PENDING');
    await expect(bob.visit.create(input)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('shows pending dishes in search only to the person who requested them', async () => {
    const alice = await withProfile(ALICE, 'alice');
    const bob = await withProfile(BOB, 'bob');
    await alice.dish.request({ name: 'Ramen burger', cuisineId: ids.japanese });

    const names = async (api: ReturnType<typeof as>) =>
      (await api.dish.search({ q: 'ramen burger' })).map((d) => `${d.name}:${d.status}`);

    expect(await names(alice)).toContain('Ramen burger:PENDING');
    expect(await names(bob)).not.toContain('Ramen burger:PENDING');
    expect(await names(as(null))).not.toContain('Ramen burger:PENDING');
  });

  it('returns the existing dish instead of duplicating it', async () => {
    const alice = await withProfile(ALICE, 'alice');

    const catalogue = await alice.dish.request({ name: 'RAMEN', cuisineId: ids.italian });
    expect(catalogue).toMatchObject({
      created: false,
      dish: { id: ids.ramen, status: 'APPROVED' },
    });

    const first = await alice.dish.request({ name: 'Ramen burger', cuisineId: ids.japanese });
    const again = await alice.dish.request({ name: 'ramen burger', cuisineId: ids.japanese });
    expect(again).toMatchObject({ created: false, dish: { id: first.dish.id } });
    expect(await prisma.dish.count()).toBe(2);
  });
});

describe('rating.mine', () => {
  it('lists only your own logs, most recent visit first, a page at a time', async () => {
    const alice = await withProfile(ALICE, 'alice');
    const bob = await withProfile(BOB, 'bob');
    const log = (api: ReturnType<typeof as>, visitedAt: string) =>
      api.visit.create({
        restaurantId: ids.restaurant,
        visitedAt,
        dishes: [{ dishId: ids.ramen, tier: 4 }],
        photos: [],
      });

    await log(alice, '2026-01-01');
    await log(alice, '2026-03-01');
    await log(alice, '2026-02-01');
    await log(bob, '2026-04-01');

    const first = await alice.rating.mine({ limit: 2 });
    expect(first.items.map((r) => r.visitedAt)).toEqual(['2026-03-01', '2026-02-01']);
    expect(first.nextCursor).not.toBeNull();

    const second = await alice.rating.mine({ limit: 2, cursor: first.nextCursor });
    expect(second.items.map((r) => r.visitedAt)).toEqual(['2026-01-01']);
    expect(second.nextCursor).toBeNull();
  });
});
