import type { Prisma } from '@tastecult/db';
import { byIdInput, commentsPageInput, createCommentInput } from '@tastecult/shared-types';
import { TRPCError } from '@trpc/server';
import type { Context } from '../context';
import { profileProcedure, publicProcedure, router } from '../trpc';
import { PUBLIC_LOG_PREVIEW, visibleLogs } from './rating';

/** How many comments a signed-out visitor sees on a log. */
export const PUBLIC_COMMENT_PREVIEW = PUBLIC_LOG_PREVIEW;

const commentSelect = {
  id: true,
  body: true,
  createdAt: true,
  userId: true,
  user: { select: { username: true, displayName: true } },
} satisfies Prisma.CommentSelect;

type CommentRow = Prisma.CommentGetPayload<{ select: typeof commentSelect }>;

/** A comment as clients see it: no user ids, but whether the viewer may delete it. */
function toCommentView(row: CommentRow, viewerId: string | null, logOwnerId: string) {
  const { userId, ...rest } = row;
  return {
    ...rest,
    canDelete: viewerId !== null && (viewerId === userId || viewerId === logOwnerId),
  };
}

async function findVisibleLog(ctx: Context, ratingId: string) {
  const rating = await ctx.prisma.rating.findFirst({
    where: { AND: [visibleLogs(ctx.auth), { id: ratingId }] },
    select: { id: true, userId: true },
  });
  if (!rating) throw new TRPCError({ code: 'NOT_FOUND', message: 'Log not found' });
  return rating;
}

export const commentRouter = router({
  /** A log's comments, oldest first, with the same preview rule as log lists. */
  list: publicProcedure.input(commentsPageInput).query(async ({ ctx, input }) => {
    const rating = await findVisibleLog(ctx, input.ratingId);
    const viewerId = ctx.auth?.userId ?? null;
    const take = viewerId ? input.limit : PUBLIC_COMMENT_PREVIEW;

    const [total, rows] = await Promise.all([
      ctx.prisma.comment.count({ where: { ratingId: rating.id } }),
      ctx.prisma.comment.findMany({
        where: { ratingId: rating.id },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: take + 1,
        // Signed-out visitors only ever get the first page, whatever cursor they send
        ...(viewerId && input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
        select: commentSelect,
      }),
    ]);

    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;
    return {
      total,
      items: page.map((row) => toCommentView(row, viewerId, rating.userId)),
      nextCursor: viewerId && hasMore ? page[page.length - 1]!.id : null,
      /** True when a signed-out visitor is seeing a preview of a longer thread. */
      limited: !viewerId && hasMore,
    };
  }),

  create: profileProcedure.input(createCommentInput).mutation(async ({ ctx, input }) => {
    const rating = await findVisibleLog(ctx, input.ratingId);
    const row = await ctx.prisma.comment.create({
      data: { ratingId: rating.id, userId: ctx.user.id, body: input.body },
      select: commentSelect,
    });
    return toCommentView(row, ctx.user.id, rating.userId);
  }),

  /** Deletes a comment. Its author and the owner of the log it's on are allowed to. */
  delete: profileProcedure.input(byIdInput).mutation(async ({ ctx, input }) => {
    const comment = await ctx.prisma.comment.findFirst({
      where: { id: input.id, rating: visibleLogs(ctx.auth) },
      select: { id: true, userId: true, rating: { select: { userId: true } } },
    });
    if (!comment) throw new TRPCError({ code: 'NOT_FOUND', message: 'Comment not found' });
    if (comment.userId !== ctx.user.id && comment.rating.userId !== ctx.user.id) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Only the comment author or the log owner can delete this',
      });
    }

    await ctx.prisma.comment.delete({ where: { id: comment.id } });
    return { id: comment.id };
  }),
});
