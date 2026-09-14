import { Prisma, type PrismaClient } from '@tastecult/db';
import { createProfileInput, usernameInput, userPageInput } from '@tastecult/shared-types';
import { TRPCError } from '@trpc/server';
import { authedProcedure, profileProcedure, publicProcedure, router } from '../trpc';

const profileSelect = { username: true, displayName: true } satisfies Prisma.UserSelect;
const personSelect = { id: true, username: true, displayName: true } satisfies Prisma.UserSelect;

async function findUserId(prisma: PrismaClient, username: string): Promise<string> {
  const user = await prisma.user.findUnique({ where: { username }, select: { id: true } });
  if (!user) throw new TRPCError({ code: 'NOT_FOUND', message: 'No one has that username' });
  return user.id;
}

async function followState(prisma: PrismaClient, followerId: string, followingId: string) {
  const [isFollowing, followerCount] = await Promise.all([
    prisma.follow.count({ where: { followerId, followingId } }),
    prisma.follow.count({ where: { followingId } }),
  ]);
  return { isFollowing: isFollowing > 0, followerCount };
}

async function listFollows(
  prisma: PrismaClient,
  viewerId: string,
  input: { username: string; cursor?: string | null; limit: number },
  kind: 'followers' | 'following',
) {
  const userId = await findUserId(prisma, input.username);
  const rows = await prisma.follow.findMany({
    where: kind === 'followers' ? { followingId: userId } : { followerId: userId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: input.limit + 1,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    select: { id: true, follower: { select: personSelect }, following: { select: personSelect } },
  });
  const hasMore = rows.length > input.limit;
  const page = hasMore ? rows.slice(0, input.limit) : rows;
  const people = page.map((row) => (kind === 'followers' ? row.follower : row.following));

  // So each person in the list can show whether you already follow them
  const viewerFollows = new Set(
    (
      await prisma.follow.findMany({
        where: { followerId: viewerId, followingId: { in: people.map((person) => person.id) } },
        select: { followingId: true },
      })
    ).map((follow) => follow.followingId),
  );

  return {
    items: people.map(({ id, ...person }) => ({
      ...person,
      isFollowing: viewerFollows.has(id),
      isSelf: id === viewerId,
    })),
    nextCursor: hasMore ? page[page.length - 1]!.id : null,
  };
}

export const userRouter = router({
  /** Who is signed in, and whether they've created their profile yet. */
  me: authedProcedure.query(async ({ ctx }) => {
    const profile = await ctx.prisma.user.findUnique({
      where: { id: ctx.auth.userId },
      select: profileSelect,
    });
    return { userId: ctx.auth.userId, email: ctx.auth.email, profile };
  }),

  createProfile: authedProcedure.input(createProfileInput).mutation(async ({ ctx, input }) => {
    const existing = await ctx.prisma.user.findUnique({
      where: { id: ctx.auth.userId },
      select: { id: true },
    });
    if (existing) {
      throw new TRPCError({ code: 'CONFLICT', message: 'You already have a profile' });
    }

    try {
      return await ctx.prisma.user.create({
        data: {
          id: ctx.auth.userId,
          username: input.username,
          displayName: input.displayName ?? null,
        },
        select: profileSelect,
      });
    } catch (error) {
      // The profile check above passed, so a unique violation here is the username
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new TRPCError({ code: 'CONFLICT', message: 'That username is taken' });
      }
      throw error;
    }
  }),

  /** A public profile. Counts are visible to everyone; the lists behind them need sign-in. */
  byUsername: publicProcedure.input(usernameInput).query(async ({ ctx, input }) => {
    const user = await ctx.prisma.user.findUnique({
      where: { username: input.username },
      select: {
        ...personSelect,
        createdAt: true,
        _count: { select: { followers: true, following: true } },
      },
    });
    if (!user) throw new TRPCError({ code: 'NOT_FOUND', message: 'No one has that username' });

    const viewerId = ctx.auth?.userId ?? null;
    const isSelf = viewerId === user.id;
    const isFollowing =
      viewerId && !isSelf
        ? (await ctx.prisma.follow.count({
            where: { followerId: viewerId, followingId: user.id },
          })) > 0
        : false;

    return {
      username: user.username,
      displayName: user.displayName,
      joinedAt: user.createdAt,
      followerCount: user._count.followers,
      followingCount: user._count.following,
      isFollowing,
      isSelf,
    };
  }),

  /** Following is one-way and instant. Following someone you already follow does nothing. */
  follow: profileProcedure.input(usernameInput).mutation(async ({ ctx, input }) => {
    const targetId = await findUserId(ctx.prisma, input.username);
    if (targetId === ctx.user.id) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: "You can't follow yourself" });
    }
    await ctx.prisma.follow.upsert({
      where: { followerId_followingId: { followerId: ctx.user.id, followingId: targetId } },
      create: { followerId: ctx.user.id, followingId: targetId },
      update: {},
    });
    return followState(ctx.prisma, ctx.user.id, targetId);
  }),

  unfollow: profileProcedure.input(usernameInput).mutation(async ({ ctx, input }) => {
    const targetId = await findUserId(ctx.prisma, input.username);
    await ctx.prisma.follow.deleteMany({
      where: { followerId: ctx.user.id, followingId: targetId },
    });
    return followState(ctx.prisma, ctx.user.id, targetId);
  }),

  followers: authedProcedure
    .input(userPageInput)
    .query(({ ctx, input }) => listFollows(ctx.prisma, ctx.auth.userId, input, 'followers')),

  following: authedProcedure
    .input(userPageInput)
    .query(({ ctx, input }) => listFollows(ctx.prisma, ctx.auth.userId, input, 'following')),
});
