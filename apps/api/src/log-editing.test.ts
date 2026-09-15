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

const logRamen = (api: Api, extra: { photoPath?: string; alias?: string } = {}) =>
  api.rating.create({ restaurantId: ids.kanadaYa, dishId: ids.ramen, tier: 3, ...extra });

describe('rating.mineById', () => {
  it("returns your own log with the dish's cuisines, and nobody else's", async () => {
    const log = await logRamen(alice, { alias: 'Tonkotsu' });

    expect(await alice.rating.mineById({ id: log.id })).toMatchObject({
      id: log.id,
      menuItem: {
        alias: 'Tonkotsu',
        restaurant: { name: 'Kanada-Ya' },
        dish: { name: 'Ramen', cuisines: [{ cuisine: { name: 'Japanese' } }] },
      },
    });
    await expect(bob.rating.mineById({ id: log.id })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('rating.update', () => {
  it('changes every field, keeps reactions and comments, and removes the unused menu item', async () => {
    const log = await alice.rating.create({
      restaurantId: ids.kanadaYa,
      dishId: ids.ramen,
      alias: 'Tonkotsu',
      tier: 2,
      cuisineId: ids.japanese,
      note: 'Meh',
    });
    await bob.reaction.set({ ratingId: log.id, type: 'WANT' });
    await bob.comment.create({ ratingId: log.id, body: 'Really?' });

    const updated = await alice.rating.update({
      id: log.id,
      restaurantId: ids.koya,
      dishId: ids.udon,
      alias: null,
      tier: 5,
      visitedAt: '2026-02-01',
      cuisineId: null,
      note: null,
    });

    expect(updated).toMatchObject({
      id: log.id,
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

  it('keeps a menu item that other logs still use', async () => {
    const mine = await logRamen(alice);
    await logRamen(bob);

    await alice.rating.update({ id: mine.id, restaurantId: ids.koya, dishId: ids.ramen, tier: 3 });

    expect(await prisma.menuItem.count()).toBe(2);
  });

  it('keeps, replaces or removes the photo, deleting the old file', async () => {
    const first = await alice.photo.createUploadUrl();
    const log = await logRamen(alice, { photoPath: first.path });
    const base = { id: log.id, restaurantId: ids.kanadaYa, dishId: ids.ramen, tier: 4 };

    const kept = await alice.rating.update(base);
    expect(kept.photoPath).toBe(first.path);
    expect(removed).toEqual([]);

    const second = await alice.photo.createUploadUrl();
    const replaced = await alice.rating.update({ ...base, photoPath: second.path });
    expect(replaced.photoUrl).toBe(second.publicUrl);
    expect(removed).toEqual([first.path]);

    const cleared = await alice.rating.update({ ...base, photoPath: null });
    expect(cleared).toMatchObject({ photoPath: null, photoUrl: null });
    expect(removed).toEqual([first.path, second.path]);
  });

  it('allows re-sending the photo a log already has, even one not in the upload format', async () => {
    const log = await logRamen(alice);
    await prisma.rating.update({ where: { id: log.id }, data: { photoPath: 'demo/old.jpg' } });

    const updated = await alice.rating.update({
      id: log.id,
      restaurantId: ids.kanadaYa,
      dishId: ids.ramen,
      tier: 5,
      photoPath: 'demo/old.jpg',
    });
    expect(updated.photoPath).toBe('demo/old.jpg');
    expect(removed).toEqual([]);
  });

  it("rejects other people's logs and photos, future dates and signed-out edits", async () => {
    const log = await logRamen(alice);
    const input = { id: log.id, restaurantId: ids.kanadaYa, dishId: ids.ramen, tier: 1 };

    await expect(as(null).rating.update(input)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(bob.rating.update(input)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      alice.rating.update({ ...input, photoPath: `${BOB}/${randomUUID()}.jpg` }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    const tomorrow = londonDateString(new Date(Date.now() + 36 * 60 * 60 * 1000));
    await expect(alice.rating.update({ ...input, visitedAt: tomorrow })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });

    expect((await alice.rating.mineById({ id: log.id })).tier).toBe(3);
  });
});

describe('rating.delete', () => {
  it('deletes your log with its reactions, comments, photo and unused menu item', async () => {
    const upload = await alice.photo.createUploadUrl();
    const log = await logRamen(alice, { photoPath: upload.path });
    await bob.reaction.set({ ratingId: log.id, type: 'FIRE' });
    await bob.comment.create({ ratingId: log.id, body: 'Nice' });

    await expect(bob.rating.delete({ id: log.id })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(await prisma.rating.count()).toBe(1);

    expect(await alice.rating.delete({ id: log.id })).toEqual({ id: log.id });
    expect(await prisma.rating.count()).toBe(0);
    expect(await prisma.reaction.count()).toBe(0);
    expect(await prisma.comment.count()).toBe(0);
    expect(await prisma.menuItem.count()).toBe(0);
    expect(removed).toEqual([upload.path]);

    await expect(alice.rating.delete({ id: log.id })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('keeps a shared menu item, and still deletes the log if the photo delete fails', async () => {
    const upload = await alice.photo.createUploadUrl();
    const log = await logRamen(alice, { photoPath: upload.path });
    await logRamen(bob);

    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failing: PhotoStorage = {
      ...storage,
      remove: async () => {
        throw new Error('storage is down');
      },
    };
    await as(ALICE, failing).rating.delete({ id: log.id });

    expect(errors).toHaveBeenCalled();
    errors.mockRestore();
    expect(await prisma.rating.count()).toBe(1);
    expect(await prisma.menuItem.count()).toBe(1);
  });
});
