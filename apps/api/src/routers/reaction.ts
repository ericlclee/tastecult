import { setReactionInput } from '@tastecult/shared-types';
import { TRPCError } from '@trpc/server';
import { socialFor } from '../social';
import { profileProcedure, router } from '../trpc';
import { visibleLogs } from './rating';

export const reactionRouter = router({
  /** Sets, switches or (with null) clears your reaction; returns the log's updated counts. */
  set: profileProcedure.input(setReactionInput).mutation(async ({ ctx, input }) => {
    const rating = await ctx.prisma.rating.findFirst({
      where: { AND: [visibleLogs(ctx.auth), { id: input.ratingId }] },
      select: { id: true },
    });
    if (!rating) throw new TRPCError({ code: 'NOT_FOUND', message: 'Log not found' });

    const key = { ratingId_userId: { ratingId: rating.id, userId: ctx.user.id } };
    if (input.type === null) {
      await ctx.prisma.reaction.deleteMany({ where: { ratingId: rating.id, userId: ctx.user.id } });
    } else {
      await ctx.prisma.reaction.upsert({
        where: key,
        create: { ratingId: rating.id, userId: ctx.user.id, type: input.type },
        update: { type: input.type },
      });
    }

    return (await socialFor(ctx.prisma, [rating.id], ctx.user.id)).get(rating.id)!;
  }),
});
