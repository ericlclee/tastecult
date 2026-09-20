import type { Prisma } from '@tastecult/db';
import {
  byIdInput,
  cursorPageInput,
  dishLogsInput,
  restaurantLogsInput,
  userPageInput,
} from '@tastecult/shared-types';
import { TRPCError } from '@trpc/server';
import type { Context } from '../context';
import {
  PUBLIC_LOG_PREVIEW,
  publicLogSelect,
  ratingSelect,
  summarizeLogs,
  toRatingView,
  visibleLogs,
  withSocial,
} from '../logs';
import { profileProcedure, publicProcedure, router } from '../trpc';

export { PUBLIC_LOG_PREVIEW, visibleLogs };

/**
 * A restaurant or dish page's logs: everything for signed-in users, a preview otherwise.
 * These stay one row per dish — the page is about that dish or that restaurant, not about
 * whole meals, which `visit.feed` and `visit.forUser` group instead.
 */
async function logsPage(
  ctx: Context,
  where: Prisma.RatingWhereInput,
  input: { cursor?: string | null; limit: number },
) {
  const signedIn = ctx.auth !== null;
  const take = signedIn ? input.limit : PUBLIC_LOG_PREVIEW;

  const [summary, rows] = await Promise.all([
    summarizeLogs(ctx.prisma, where),
    ctx.prisma.rating.findMany({
      where,
      orderBy: [{ visitedAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      // Signed-out visitors only ever get the first page, whatever cursor they send
      ...(signedIn && input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      select: publicLogSelect,
    }),
  ]);

  const hasMore = rows.length > take;
  const page = hasMore ? rows.slice(0, take) : rows;
  return {
    summary,
    items: await withSocial(ctx, page),
    nextCursor: signedIn && hasMore ? page[page.length - 1]!.id : null,
    /** True when a signed-out visitor is seeing a preview of a longer list. */
    limited: !signedIn && hasMore,
  };
}

export const ratingRouter = router({
  /** One of your own dish logs — mainly to find the visit it belongs to. */
  mineById: profileProcedure.input(byIdInput).query(async ({ ctx, input }) => {
    const row = await ctx.prisma.rating.findFirst({
      where: { id: input.id, userId: ctx.user.id },
      select: ratingSelect,
    });
    if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'Log not found' });
    return toRatingView(row, ctx.storage);
  }),

  /** Your own dish logs, flat and most recent visit first. */
  mine: profileProcedure.input(cursorPageInput).query(async ({ ctx, input }) => {
    const rows = await ctx.prisma.rating.findMany({
      where: { userId: ctx.user.id },
      orderBy: [{ visitedAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
      take: input.limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      select: ratingSelect,
    });
    const hasMore = rows.length > input.limit;
    const page = hasMore ? rows.slice(0, input.limit) : rows;
    return {
      items: await withSocial(ctx, page),
      nextCursor: hasMore ? page[page.length - 1]!.id : null,
    };
  }),

  /** Everyone's logs at a restaurant. */
  forRestaurant: publicProcedure.input(restaurantLogsInput).query(async ({ ctx, input }) => {
    const restaurant = await ctx.prisma.restaurant.findUnique({
      where: { id: input.restaurantId },
      select: { id: true },
    });
    if (!restaurant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Restaurant not found' });

    return logsPage(
      ctx,
      { AND: [visibleLogs(ctx.auth), { menuItem: { restaurantId: restaurant.id } }] },
      input,
    );
  }),

  /** Everyone's logs of a dish, anywhere — including its variants (Pizza includes Margherita). */
  forDish: publicProcedure.input(dishLogsInput).query(async ({ ctx, input }) => {
    const dish = await ctx.prisma.dish.findFirst({
      where: {
        id: input.dishId,
        OR: ctx.auth
          ? [{ status: 'APPROVED' }, { status: 'PENDING', requestedById: ctx.auth.userId }]
          : [{ status: 'APPROVED' }],
      },
      select: { id: true, variants: { where: { status: 'APPROVED' }, select: { id: true } } },
    });
    if (!dish) throw new TRPCError({ code: 'NOT_FOUND', message: 'Dish not found' });

    const dishIds = [dish.id, ...dish.variants.map((variant) => variant.id)];
    return logsPage(
      ctx,
      { AND: [visibleLogs(ctx.auth), { menuItem: { dishId: { in: dishIds } } }] },
      input,
    );
  }),

  /** A person's dish logs on their profile, with the same preview rule as other pages. */
  forUser: publicProcedure.input(userPageInput).query(async ({ ctx, input }) => {
    const user = await ctx.prisma.user.findUnique({
      where: { username: input.username },
      select: { id: true },
    });
    if (!user) throw new TRPCError({ code: 'NOT_FOUND', message: 'No one has that username' });

    return logsPage(ctx, { AND: [visibleLogs(ctx.auth), { userId: user.id }] }, input);
  }),
});
