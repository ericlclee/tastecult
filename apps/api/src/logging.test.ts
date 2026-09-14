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

describe('rating.create', () => {
  it('saves a full log with a photo and returns it ready to display', async () => {
    const alice = await withProfile(ALICE, 'alice');
    const upload = await alice.photo.createUploadUrl();

    const rating = await alice.rating.create({
      restaurantId: ids.restaurant,
      dishId: ids.ramen,
      tier: 5,
      alias: 'Tonkotsu ramen',
      photoPath: upload.path,
      note: '  Rich broth  ',
      cuisineId: ids.japanese,
    });

    expect(rating).toMatchObject({
      tier: 5,
      note: 'Rich broth',
      photoPath: upload.path,
      photoUrl: upload.publicUrl,
      visitedAt: londonDateString(),
      cuisine: { slug: 'japanese' },
      menuItem: {
        alias: 'Tonkotsu ramen',
        restaurant: { name: 'Kanada-Ya' },
        dish: { name: 'Ramen', status: 'APPROVED' },
      },
    });
  });

  it('saves with only the required fields', async () => {
    const alice = await withProfile(ALICE, 'alice');

    const rating = await alice.rating.create({
      restaurantId: ids.restaurant,
      dishId: ids.ramen,
      tier: 3,
    });

    expect(rating).toMatchObject({
      note: null,
      photoPath: null,
      photoUrl: null,
      cuisine: null,
      menuItem: { alias: null },
    });
  });

  it('reuses a menu item for the same menu name however it is typed', async () => {
    const alice = await withProfile(ALICE, 'alice');
    const log = (tier: number, alias?: string) =>
      alice.rating.create({ restaurantId: ids.restaurant, dishId: ids.ramen, tier, alias });

    await log(4, 'Tonkotsu Ramen');
    await log(5, '  tonkotsu   ramen ');
    await log(3, 'Spicy miso ramen');
    await log(3);

    const items = await prisma.menuItem.findMany({ orderBy: { normalizedAlias: 'asc' } });
    expect(items.map((i) => i.alias)).toEqual([null, 'Spicy miso ramen', 'Tonkotsu Ramen']);
    expect(await prisma.rating.count()).toBe(4);
  });

  it('requires sign-in and a profile', async () => {
    const input = { restaurantId: ids.restaurant, dishId: ids.ramen, tier: 4 };
    await expect(as(null).rating.create(input)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(as(ALICE).rating.create(input)).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
    });
  });

  it("rejects someone else's photo or a made-up path", async () => {
    const alice = await withProfile(ALICE, 'alice');
    const input = { restaurantId: ids.restaurant, dishId: ids.ramen, tier: 4 };

    await expect(
      alice.rating.create({ ...input, photoPath: `${BOB}/${randomUUID()}.jpg` }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      alice.rating.create({ ...input, photoPath: `${ALICE}/../${BOB}/photo.jpg` }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('accepts a past visit date and rejects a future one', async () => {
    const alice = await withProfile(ALICE, 'alice');
    const input = { restaurantId: ids.restaurant, dishId: ids.ramen, tier: 4 };

    const past = await alice.rating.create({ ...input, visitedAt: '2026-01-15' });
    expect(past.visitedAt).toBe('2026-01-15');

    const tomorrow = londonDateString(new Date(Date.now() + 36 * 60 * 60 * 1000));
    await expect(alice.rating.create({ ...input, visitedAt: tomorrow })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it('rejects unknown restaurants and cuisines, and tiers outside 1–5', async () => {
    const alice = await withProfile(ALICE, 'alice');
    const input = { restaurantId: ids.restaurant, dishId: ids.ramen, tier: 4 };

    await expect(alice.rating.create({ ...input, restaurantId: 'missing' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(alice.rating.create({ ...input, cuisineId: 'missing' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
    await expect(alice.rating.create({ ...input, tier: 6 })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
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

    const input = { restaurantId: ids.restaurant, dishId: dish.id, tier: 4 };
    await expect(alice.rating.create(input)).resolves.toMatchObject({
      menuItem: { dish: { status: 'PENDING' } },
    });
    await expect(bob.rating.create(input)).rejects.toMatchObject({ code: 'NOT_FOUND' });
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
      api.rating.create({ restaurantId: ids.restaurant, dishId: ids.ramen, tier: 4, visitedAt });

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
