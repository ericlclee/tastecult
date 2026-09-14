import { Prisma } from '@tastecult/db';
import { createProfileInput } from '@tastecult/shared-types';
import { TRPCError } from '@trpc/server';
import { authedProcedure, router } from '../trpc';

const profileSelect = { username: true, displayName: true } satisfies Prisma.UserSelect;

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
});
