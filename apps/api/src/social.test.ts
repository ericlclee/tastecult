import { createTestPrismaClient, resetDatabase } from '@tastecult/db/testing';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createCaller } from './router';
import { PUBLIC_COMMENT_PREVIEW } from './routers/comment';
import type { PhotoStorage } from './storage';

const prisma = createTestPrismaClient();

const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';
const CAROL = '33333333-3333-4333-8333-333333333333';
const NO_PROFILE = '44444444-4444-4444-8444-444444444444';

const storage: PhotoStorage = {
  createUploadUrl: async (path) => ({
    signedUrl: `https://storage.test/upload/${path}`,
    token: 't',
  }),
  publicUrl: (path) => `https://storage.test/public/${path}`,
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

let restaurantId: string;
let ramenId: string;
let cuisineId: string;
let alice: Api;
let bob: Api;
let carol: Api;
/** A log of Alice's that the tests react to and comment on. */
let logId: string;

beforeEach(async () => {
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
  const ramen = await prisma.dish.create({ data: { slug: 'ramen', name: 'Ramen' } });
  restaurantId = restaurant.id;
  ramenId = ramen.id;
  cuisineId = japanese.id;

  alice = await withProfile(ALICE, 'alice');
  bob = await withProfile(BOB, 'bob');
  carol = await withProfile(CAROL, 'carol');
  logId = (await alice.rating.create({ restaurantId, dishId: ramenId, tier: 4 })).id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

const restaurantLog = async (api: Api) =>
  (await api.rating.forRestaurant({ restaurantId })).items.find((item) => item.id === logId)!;

describe('reactions', () => {
  it('sets, switches and clears one reaction per person, with counts on every log list', async () => {
    expect(await bob.reaction.set({ ratingId: logId, type: 'WANT' })).toMatchObject({
      reactionCounts: { WANT: 1, FIRE: 0 },
      myReaction: 'WANT',
    });
    await carol.reaction.set({ ratingId: logId, type: 'WANT' });

    // Switching replaces Bob's reaction rather than adding a second one
    expect(await bob.reaction.set({ ratingId: logId, type: 'FIRE' })).toMatchObject({
      reactionCounts: { WANT: 1, FIRE: 1 },
      myReaction: 'FIRE',
    });

    expect((await restaurantLog(as(null))).social).toEqual({
      reactionCounts: { WANT: 1, FIRE: 1, CLAP: 0, LOL: 0 },
      myReaction: null,
      commentCount: 0,
    });
    expect((await restaurantLog(carol)).social.myReaction).toBe('WANT');

    await alice.user.follow({ username: 'bob' });
    await bob.user.follow({ username: 'alice' });
    const [feedItem] = (await bob.rating.feed({})).items;
    expect(feedItem!.social.myReaction).toBe('FIRE');
    expect((await alice.rating.mine({})).items[0]!.social.reactionCounts.FIRE).toBe(1);

    expect(await bob.reaction.set({ ratingId: logId, type: null })).toMatchObject({
      reactionCounts: { WANT: 1, FIRE: 0 },
      myReaction: null,
    });
    // Clearing a reaction you don't have is harmless
    await expect(bob.reaction.set({ ratingId: logId, type: null })).resolves.toBeDefined();
  });

  it('needs a profile, and hides logs you are not allowed to see', async () => {
    await expect(as(null).reaction.set({ ratingId: logId, type: 'WANT' })).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
    await expect(
      as(NO_PROFILE).reaction.set({ ratingId: logId, type: 'WANT' }),
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    await expect(bob.reaction.set({ ratingId: 'nope', type: 'WANT' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });

    // A log of Alice's requested dish is only visible to Alice until it's approved
    const { dish: pending } = await alice.dish.request({ name: 'Secret soup', cuisineId });
    const hidden = await alice.rating.create({ restaurantId, dishId: pending.id, tier: 3 });
    await expect(bob.reaction.set({ ratingId: hidden.id, type: 'WANT' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(bob.comment.create({ ratingId: hidden.id, body: 'hi' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

describe('comments', () => {
  it('lists comments oldest first and counts them on the log', async () => {
    await bob.comment.create({ ratingId: logId, body: '  Is the broth rich?  ' });
    await alice.comment.create({ ratingId: logId, body: 'Very!' });

    const thread = await carol.comment.list({ ratingId: logId });
    expect(thread.total).toBe(2);
    expect(thread.items.map((c) => [c.user.username, c.body])).toEqual([
      ['bob', 'Is the broth rich?'],
      ['alice', 'Very!'],
    ]);
    expect(thread.items[0]).not.toHaveProperty('userId');
    expect((await restaurantLog(as(null))).social.commentCount).toBe(2);
  });

  it('shows signed-out visitors a preview and signed-in people everything', async () => {
    for (let i = 1; i <= PUBLIC_COMMENT_PREVIEW + 2; i++) {
      await bob.comment.create({ ratingId: logId, body: `Comment ${i}` });
    }

    const preview = await as(null).comment.list({ ratingId: logId, cursor: 'ignored' });
    expect(preview).toMatchObject({
      total: PUBLIC_COMMENT_PREVIEW + 2,
      limited: true,
      nextCursor: null,
    });
    expect(preview.items).toHaveLength(PUBLIC_COMMENT_PREVIEW);
    expect(preview.items.every((c) => !c.canDelete)).toBe(true);

    const first = await carol.comment.list({ ratingId: logId, limit: 3 });
    const second = await carol.comment.list({
      ratingId: logId,
      limit: 3,
      cursor: first.nextCursor,
    });
    expect([...first.items, ...second.items].map((c) => c.body)).toEqual([
      'Comment 1',
      'Comment 2',
      'Comment 3',
      'Comment 4',
      'Comment 5',
    ]);
    expect(second).toMatchObject({ limited: false, nextCursor: null });
  });

  it('rejects empty comments', async () => {
    await expect(bob.comment.create({ ratingId: logId, body: '   ' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it('lets the author or the log owner delete a comment, and nobody else', async () => {
    const bobs = await bob.comment.create({ ratingId: logId, body: 'From Bob' });
    const carols = await carol.comment.create({ ratingId: logId, body: 'From Carol' });

    // Alice owns the log, so she may delete anyone's comment on it
    const asAlice = await alice.comment.list({ ratingId: logId });
    expect(asAlice.items.map((c) => c.canDelete)).toEqual([true, true]);
    const asCarol = await carol.comment.list({ ratingId: logId });
    expect(asCarol.items.map((c) => c.canDelete)).toEqual([false, true]);

    await expect(carol.comment.delete({ id: bobs.id })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await carol.comment.delete({ id: carols.id });
    await alice.comment.delete({ id: bobs.id });
    expect((await bob.comment.list({ ratingId: logId })).total).toBe(0);

    await expect(alice.comment.delete({ id: bobs.id })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('removes reactions and comments along with the person who made them', async () => {
    await bob.reaction.set({ ratingId: logId, type: 'CLAP' });
    await bob.comment.create({ ratingId: logId, body: 'Nice' });
    await prisma.user.delete({ where: { id: BOB } });

    expect((await restaurantLog(carol)).social).toMatchObject({
      reactionCounts: { CLAP: 0 },
      commentCount: 0,
    });
  });
});
