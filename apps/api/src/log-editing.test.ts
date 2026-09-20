import { randomUUID } from 'node:crypto';
import { createTestPrismaClient, resetDatabase } from '@tastecult/db/testing';
import { londonDateString } from '@tastecult/shared-types';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCaller } from './router';
import type { PhotoStorage } from './storage';

const prisma = createTestPrismaClient();

const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';

/** Photo paths the API asked storage to delete. */
let removed: string[] = [];

const storage: PhotoStorage = {
  createUploadUrl: async (path) => ({
    signedUrl: `https://storage.test/upload/${path}`,
    token: 't',
  }),
  publicUrl: (path) => `https://storage.test/public/${path}`,
  remove: async (paths) => {
    removed.push(...paths);
  },
};

type Api = ReturnType<typeof createCaller>;

function as(userId: string | null, photoStorage: PhotoStorage | null = storage): Api {
  return createCaller({
    prisma,
    auth: userId ? { userId, email: `${userId.slice(0, 4)}@example.com` } : null,
    storage: photoStorage,
  });
}

let ids: { kanadaYa: string; koya: string; japanese: string; ramen: string; udon: string };
let alice: Api;
let bob: Api;

beforeEach(async () => {
  removed = [];
  await resetDatabase(prisma);
  const restaurant = (fhrsId: number, name: string) =>
    prisma.restaurant.create({
      data: {
        fhrsId,
        name,
        businessType: 'Restaurant/Cafe/Canteen',
        businessTypeId: 1,
        localAuthority: 'Westminster',
      },
    });
  const japanese = await prisma.cuisine.create({
    data: { slug: 'japanese', name: 'Japanese', region: 'East Asian', macroRegion: 'Asian' },
  });
  const dish = (slug: string, name: string) =>
    prisma.dish.create({
      data: { slug, name, cuisines: { create: [{ cuisineId: japanese.id }] } },
    });

  ids = {
    kanadaYa: (await restaurant(1, 'Kanada-Ya')).id,
    koya: (await restaurant(2, 'Koya')).id,
    japanese: japanese.id,
    ramen: (await dish('ramen', 'Ramen')).id,
    udon: (await dish('udon', 'Udon')).id,
  };

  alice = as(ALICE);
  await alice.user.createProfile({ username: 'alice' });
  bob = as(BOB);
  await bob.user.createProfile({ username: 'bob' });
});

afterAll(async () => {
  await prisma.$disconnect();
});

/** A one-dish visit, the shape most of these tests start from. */
const visitRamen = (
  api: Api,
  extra: { photos?: { path: string; dishIndex?: number }[]; alias?: string } = {},
) =>
  api.visit.create({
    restaurantId: ids.kanadaYa,
    dishes: [{ dishId: ids.ramen, tier: 3, alias: extra.alias }],
    photos: extra.photos ?? [],
  });

describe('visit.mineById', () => {
  it("returns your own visit with each dish's cuisines, and nobody else's", async () => {
    const visit = await visitRamen(alice, { alias: 'Tonkotsu' });

    expect(await alice.visit.mineById({ id: visit.id })).toMatchObject({
      id: visit.id,
      restaurant: { name: 'Kanada-Ya' },
      dishes: [
        {
          menuItem: {
            alias: 'Tonkotsu',
            dish: { name: 'Ramen', cuisines: [{ cuisine: { name: 'Japanese' } }] },
          },
        },
      ],
    });
    await expect(bob.visit.mineById({ id: visit.id })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('visit.update', () => {
  it('changes every field, keeps reactions and comments, and removes the unused menu item', async () => {
    const visit = await alice.visit.create({
      restaurantId: ids.kanadaYa,
      note: 'Fine',
      dishes: [
        { dishId: ids.ramen, alias: 'Tonkotsu', tier: 2, cuisineId: ids.japanese, note: 'Meh' },
      ],
      photos: [],
    });
    const logId = visit.dishes[0]!.id;
    await bob.reaction.set({ ratingId: logId, type: 'WANT' });
    await bob.comment.create({ ratingId: logId, body: 'Really?' });

    const updated = await alice.visit.update({
      id: visit.id,
      restaurantId: ids.koya,
      visitedAt: '2026-02-01',
      note: null,
      dishes: [{ id: logId, dishId: ids.udon, alias: null, tier: 5, cuisineId: null, note: null }],
      photos: [],
    });

    expect(updated).toMatchObject({ id: visit.id, visitedAt: '2026-02-01', note: null });
    expect(updated.dishes[0]).toMatchObject({
      id: logId,
      tier: 5,
      visitedAt: '2026-02-01',
      cuisine: null,
      note: null,
      menuItem: { alias: null, restaurant: { name: 'Koya' }, dish: { name: 'Udon' } },
    });
    expect(await prisma.menuItem.count()).toBe(1);

    const [moved] = (await bob.rating.forRestaurant({ restaurantId: ids.koya })).items;
    expect(moved!.social).toMatchObject({ reactionCounts: { WANT: 1 }, commentCount: 1 });
    expect((await bob.rating.forRestaurant({ restaurantId: ids.kanadaYa })).items).toEqual([]);
  });

  it('adds a dish to a visit without disturbing the ones already on it', async () => {
    const visit = await visitRamen(alice);
    const ramenLog = visit.dishes[0]!.id;
    await bob.reaction.set({ ratingId: ramenLog, type: 'FIRE' });

    const updated = await alice.visit.update({
      id: visit.id,
      restaurantId: ids.kanadaYa,
      dishes: [
        { id: ramenLog, dishId: ids.ramen, tier: 3 },
        { dishId: ids.udon, tier: 5 },
      ],
      photos: [],
    });

    expect(updated.dishes.map((dish) => dish.menuItem.dish.name)).toEqual(['Ramen', 'Udon']);
    // The dish that was already there kept its id, and so its reaction
    expect(updated.dishes[0]!.id).toBe(ramenLog);
    expect(updated.dishes[0]!.social.reactionCounts).toMatchObject({ FIRE: 1 });
    expect(await prisma.rating.count()).toBe(2);
  });

  it('removes a dish left out of the update, with its reactions and menu item', async () => {
    const visit = await alice.visit.create({
      restaurantId: ids.kanadaYa,
      dishes: [
        { dishId: ids.ramen, tier: 4 },
        { dishId: ids.udon, tier: 2 },
      ],
      photos: [],
    });
    const [ramenLog, udonLog] = visit.dishes.map((dish) => dish.id);
    await bob.reaction.set({ ratingId: udonLog!, type: 'LOL' });

    const updated = await alice.visit.update({
      id: visit.id,
      restaurantId: ids.kanadaYa,
      dishes: [{ id: ramenLog!, dishId: ids.ramen, tier: 4 }],
      photos: [],
    });

    expect(updated.dishes).toHaveLength(1);
    expect(await prisma.rating.count()).toBe(1);
    expect(await prisma.reaction.count()).toBe(0);
    // The udon menu item has no logs left
    expect(await prisma.menuItem.count()).toBe(1);
  });

  it("rejects a dish id that belongs to somebody else's visit", async () => {
    const mine = await visitRamen(alice);
    const theirs = await visitRamen(bob);

    await expect(
      alice.visit.update({
        id: mine.id,
        restaurantId: ids.kanadaYa,
        dishes: [{ id: theirs.dishes[0]!.id, dishId: ids.ramen, tier: 1 }],
        photos: [],
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('keeps a menu item that other logs still use', async () => {
    const mine = await visitRamen(alice);
    await visitRamen(bob);

    await alice.visit.update({
      id: mine.id,
      restaurantId: ids.koya,
      dishes: [{ id: mine.dishes[0]!.id, dishId: ids.ramen, tier: 3 }],
      photos: [],
    });

    expect(await prisma.menuItem.count()).toBe(2);
  });

  it('keeps, adds, relinks and removes photos, deleting the files that go', async () => {
    const first = await alice.photo.createUploadUrl();
    const visit = await visitRamen(alice, { photos: [{ path: first.path, dishIndex: 0 }] });
    const logId = visit.dishes[0]!.id;
    const base = {
      id: visit.id,
      restaurantId: ids.kanadaYa,
      dishes: [{ id: logId, dishId: ids.ramen, tier: 4 }],
    };

    const kept = await alice.visit.update({
      ...base,
      photos: [{ path: first.path, dishIndex: 0 }],
    });
    expect(kept.photos.map((photo) => photo.path)).toEqual([first.path]);
    expect(removed).toEqual([]);

    // Added alongside the first, and detached from the dish onto the visit itself
    const second = await alice.photo.createUploadUrl();
    const both = await alice.visit.update({
      ...base,
      photos: [
        { path: first.path, dishIndex: null },
        { path: second.path, dishIndex: 0 },
      ],
    });
    expect(both.photos.map((photo) => [photo.path, photo.dishIndex])).toEqual([
      [first.path, null],
      [second.path, 0],
    ]);
    expect(both.dishes[0]!.photoUrl).toBe(second.publicUrl);
    expect(removed).toEqual([]);

    const cleared = await alice.visit.update({ ...base, photos: [] });
    expect(cleared.photos).toEqual([]);
    expect(cleared.dishes[0]!.photoUrl).toBeNull();
    expect(removed).toEqual([first.path, second.path]);
  });

  it('allows re-sending a photo the visit already has, even one not in the upload format', async () => {
    const visit = await visitRamen(alice);
    await prisma.visitPhoto.create({ data: { visitId: visit.id, path: 'demo/old.jpg' } });

    const updated = await alice.visit.update({
      id: visit.id,
      restaurantId: ids.kanadaYa,
      dishes: [{ id: visit.dishes[0]!.id, dishId: ids.ramen, tier: 5 }],
      photos: [{ path: 'demo/old.jpg' }],
    });
    expect(updated.photos.map((photo) => photo.path)).toEqual(['demo/old.jpg']);
    expect(removed).toEqual([]);
  });

  it('rejects a photo that is already on another visit', async () => {
    const upload = await alice.photo.createUploadUrl();
    await visitRamen(alice, { photos: [{ path: upload.path }] });
    const other = await visitRamen(alice);

    await expect(
      alice.visit.update({
        id: other.id,
        restaurantId: ids.kanadaYa,
        dishes: [{ id: other.dishes[0]!.id, dishId: ids.ramen, tier: 3 }],
        photos: [{ path: upload.path }],
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it("rejects other people's visits and photos, future dates and signed-out edits", async () => {
    const visit = await visitRamen(alice);
    const input = {
      id: visit.id,
      restaurantId: ids.kanadaYa,
      dishes: [{ id: visit.dishes[0]!.id, dishId: ids.ramen, tier: 1 }],
      photos: [],
    };

    await expect(as(null).visit.update(input)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(bob.visit.update(input)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      alice.visit.update({ ...input, photos: [{ path: `${BOB}/${randomUUID()}.jpg` }] }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    const tomorrow = londonDateString(new Date(Date.now() + 36 * 60 * 60 * 1000));
    await expect(alice.visit.update({ ...input, visitedAt: tomorrow })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });

    expect((await alice.visit.mineById({ id: visit.id })).dishes[0]!.tier).toBe(3);
  });
});

describe('visit.delete', () => {
  it('deletes your visit with every dish, reaction, comment, photo and unused menu item', async () => {
    const upload = await alice.photo.createUploadUrl();
    const visit = await alice.visit.create({
      restaurantId: ids.kanadaYa,
      dishes: [
        { dishId: ids.ramen, tier: 3 },
        { dishId: ids.udon, tier: 4 },
      ],
      photos: [{ path: upload.path, dishIndex: 0 }],
    });
    await bob.reaction.set({ ratingId: visit.dishes[0]!.id, type: 'FIRE' });
    await bob.comment.create({ ratingId: visit.dishes[1]!.id, body: 'Nice' });

    await expect(bob.visit.delete({ id: visit.id })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(await prisma.rating.count()).toBe(2);

    expect(await alice.visit.delete({ id: visit.id })).toEqual({ id: visit.id });
    expect(await prisma.visit.count()).toBe(0);
    expect(await prisma.rating.count()).toBe(0);
    expect(await prisma.reaction.count()).toBe(0);
    expect(await prisma.comment.count()).toBe(0);
    expect(await prisma.visitPhoto.count()).toBe(0);
    expect(await prisma.menuItem.count()).toBe(0);
    expect(removed).toEqual([upload.path]);

    await expect(alice.visit.delete({ id: visit.id })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('keeps a shared menu item, and still deletes the visit if the photo delete fails', async () => {
    const upload = await alice.photo.createUploadUrl();
    const visit = await visitRamen(alice, { photos: [{ path: upload.path }] });
    await visitRamen(bob);

    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failing: PhotoStorage = {
      ...storage,
      remove: async () => {
        throw new Error('storage is down');
      },
    };
    await as(ALICE, failing).visit.delete({ id: visit.id });

    expect(errors).toHaveBeenCalled();
    errors.mockRestore();
    expect(await prisma.rating.count()).toBe(1);
    expect(await prisma.menuItem.count()).toBe(1);
  });
});
