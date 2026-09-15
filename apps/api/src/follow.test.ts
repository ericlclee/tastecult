import { createTestPrismaClient, resetDatabase } from '@tastecult/db/testing';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createCaller } from './router';
import { PUBLIC_LOG_PREVIEW } from './routers/rating';
import type { PhotoStorage } from './storage';

const prisma = createTestPrismaClient();

const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';
const CAROL = '33333333-3333-4333-8333-333333333333';
const DAVE = '44444444-4444-4444-8444-444444444444';

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
  const restaurant = await prisma.restaurant.create({
    data: {
      fhrsId: 1,
      name: 'Kanada-Ya',
      businessType: 'Restaurant/Cafe/Canteen',
      businessTypeId: 1,
      localAuthority: 'Westminster',
    },
  });
  const japanese = await prisma.cuisine.create({
    data: { slug: 'japanese', name: 'Japanese', region: 'East Asian', macroRegion: 'Asian' },
  });
  const ramen = await prisma.dish.create({
    data: { slug: 'ramen', name: 'Ramen', cuisines: { create: [{ cuisineId: japanese.id }] } },
  });
  return { restaurant: restaurant.id, japanese: japanese.id, ramen: ramen.id };
}

const logRamen = (api: Api, tier: number, note?: string) =>
  api.rating.create({ restaurantId: ids.restaurant, dishId: ids.ramen, tier, note });

beforeEach(async () => {
  ids = await seed();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('profiles', () => {
  it('shows public counts to anyone, matching usernames regardless of capitalisation', async () => {
    const alice = await withProfile(ALICE, 'alice');
    await withProfile(BOB, 'bob');
    await alice.user.follow({ username: 'bob' });

    expect(await as(null).user.byUsername({ username: 'BOB' })).toMatchObject({
      username: 'bob',
      followerCount: 1,
      followingCount: 0,
      isFollowing: false,
      isSelf: false,
    });
    expect(await alice.user.byUsername({ username: 'bob' })).toMatchObject({ isFollowing: true });
    expect(await alice.user.byUsername({ username: 'alice' })).toMatchObject({
      isSelf: true,
      followingCount: 1,
    });
    await expect(as(null).user.byUsername({ username: 'nobody' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

describe('following', () => {
  it('follows and unfollows, and doing either twice changes nothing', async () => {
    const alice = await withProfile(ALICE, 'alice');
    await withProfile(BOB, 'bob');

    expect(await alice.user.follow({ username: 'bob' })).toEqual({
      isFollowing: true,
      followerCount: 1,
    });
    expect(await alice.user.follow({ username: 'bob' })).toEqual({
      isFollowing: true,
      followerCount: 1,
    });
    expect(await alice.user.unfollow({ username: 'bob' })).toEqual({
      isFollowing: false,
      followerCount: 0,
    });
    expect(await alice.user.unfollow({ username: 'bob' })).toEqual({
      isFollowing: false,
      followerCount: 0,
    });
  });

  it('needs a profile, a real person, and someone other than you', async () => {
    const alice = await withProfile(ALICE, 'alice');
    await withProfile(BOB, 'bob');

    await expect(as(null).user.follow({ username: 'bob' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
    await expect(as(CAROL).user.follow({ username: 'bob' })).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
    });
    await expect(alice.user.follow({ username: 'alice' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
    await expect(alice.user.follow({ username: 'nobody' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('lists followers and following to signed-in people, a page at a time', async () => {
    const alice = await withProfile(ALICE, 'alice');
    const bob = await withProfile(BOB, 'bob');
    const carol = await withProfile(CAROL, 'carol');
    await bob.user.follow({ username: 'alice' });
    await carol.user.follow({ username: 'alice' });
    await alice.user.follow({ username: 'carol' });

    await expect(as(null).user.followers({ username: 'alice' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });

    const first = await alice.user.followers({ username: 'alice', limit: 1 });
    const second = await alice.user.followers({
      username: 'alice',
      limit: 1,
      cursor: first.nextCursor,
    });
    expect([...first.items, ...second.items]).toEqual([
      { username: 'carol', displayName: null, isFollowing: true, isSelf: false },
      { username: 'bob', displayName: null, isFollowing: false, isSelf: false },
    ]);
    expect(second.nextCursor).toBeNull();

    // Signed in without a username is enough to read a list
    const following = await as(DAVE).user.following({ username: 'alice' });
    expect(following.items.map((person) => person.username)).toEqual(['carol']);
  });
});

describe('rating.feed', () => {
  it('shows logs from people you follow, newest first, without your own', async () => {
    const alice = await withProfile(ALICE, 'alice');
    const bob = await withProfile(BOB, 'bob');
    const carol = await withProfile(CAROL, 'carol');
    const dave = await withProfile(DAVE, 'dave');
    await alice.user.follow({ username: 'bob' });
    await alice.user.follow({ username: 'carol' });

    await logRamen(bob, 4, 'bob first');
    await logRamen(dave, 5, 'dave — not followed');
    await logRamen(alice, 3, 'alice — her own');
    await logRamen(carol, 2, 'carol');
    await logRamen(bob, 5, 'bob again');

    const notes = async (cursor?: string | null) => alice.rating.feed({ limit: 2, cursor });
    const first = await notes();
    const second = await notes(first.nextCursor);

    expect([...first.items, ...second.items].map((log) => log.note)).toEqual([
      'bob again',
      'carol',
      'bob first',
    ]);
    expect(first.items[0]?.user.username).toBe('bob');
    expect(second.nextCursor).toBeNull();
  });

  it("hides a followed person's logs of dishes they requested", async () => {
    const alice = await withProfile(ALICE, 'alice');
    const bob = await withProfile(BOB, 'bob');
    await alice.user.follow({ username: 'bob' });
    const { dish } = await bob.dish.request({ name: 'Ramen burger', cuisineId: ids.japanese });
    await bob.rating.create({ restaurantId: ids.restaurant, dishId: dish.id, tier: 4 });
    await logRamen(bob, 3);

    const feed = await alice.rating.feed({});
    expect(feed.items.map((log) => log.menuItem.dish.name)).toEqual(['Ramen']);
  });

  it('needs a profile', async () => {
    await expect(as(ALICE).rating.feed({})).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
  });
});

describe('rating.forUser', () => {
  it("previews a person's logs for visitors and shows all of them to signed-in people", async () => {
    const bob = await withProfile(BOB, 'bob');
    for (let i = 0; i < PUBLIC_LOG_PREVIEW + 2; i++) await logRamen(bob, 4, `log ${i}`);

    const preview = await as(null).rating.forUser({ username: 'bob' });
    expect(preview.items).toHaveLength(PUBLIC_LOG_PREVIEW);
    expect(preview).toMatchObject({ limited: true, summary: { logCount: PUBLIC_LOG_PREVIEW + 2 } });

    const full = await as(ALICE).rating.forUser({ username: 'bob' });
    expect(full.items).toHaveLength(PUBLIC_LOG_PREVIEW + 2);
    expect(full.limited).toBe(false);

    await expect(as(null).rating.forUser({ username: 'nobody' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});
