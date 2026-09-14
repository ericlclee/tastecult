import { Prisma } from '@tastecult/db';
import {
  cleanAlias,
  createRatingInput,
  cursorPageInput,
  londonDateString,
  normalizeAlias,
} from '@tastecult/shared-types';
import { TRPCError } from '@trpc/server';
import { isOwnPhotoPath } from '../photos';
import type { PhotoStorage } from '../storage';
import { profileProcedure, router } from '../trpc';

const ratingSelect = {
  id: true,
  tier: true,
  visitedAt: true,
  note: true,
  photoPath: true,
  createdAt: true,
  cuisine: { select: { id: true, slug: true, name: true } },
  menuItem: {
    select: {
      id: true,
      alias: true,
      restaurant: { select: { id: true, name: true, postcode: true } },
      dish: { select: { id: true, slug: true, name: true, status: true } },
    },
  },
} satisfies Prisma.RatingSelect;

type RatingRow = Prisma.RatingGetPayload<{ select: typeof ratingSelect }>;

function toRatingView(row: RatingRow, storage: PhotoStorage | null) {
  const { visitedAt, ...rest } = row;
  return {
    ...rest,
    // Stored as a DATE, which comes back as midnight UTC — so the ISO date is the day
    visitedAt: visitedAt.toISOString().slice(0, 10),
    photoUrl: row.photoPath && storage ? storage.publicUrl(row.photoPath) : null,
  };
}

export const ratingRouter = router({
  create: profileProcedure.input(createRatingInput).mutation(async ({ ctx, input }) => {
    const userId = ctx.user.id;

    const today = londonDateString();
    const visitedOn = input.visitedAt ?? today;
    if (visitedOn > today) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: "The visit date can't be in the future",
      });
    }

    if (input.photoPath && !isOwnPhotoPath(input.photoPath, userId)) {
      throw new TRPCError({ code: 'FORBIDDEN', message: "That photo isn't one of your uploads" });
    }

    const [restaurant, dish, cuisine] = await Promise.all([
      ctx.prisma.restaurant.findUnique({ where: { id: input.restaurantId }, select: { id: true } }),
      // A dish you requested can be logged before it's approved; nobody else's can
      ctx.prisma.dish.findFirst({
        where: {
          id: input.dishId,
          OR: [{ status: 'APPROVED' }, { status: 'PENDING', requestedById: userId }],
        },
        select: { id: true },
      }),
      input.cuisineId
        ? ctx.prisma.cuisine.findUnique({ where: { id: input.cuisineId }, select: { id: true } })
        : null,
    ]);
    if (!restaurant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Restaurant not found' });
    if (!dish) throw new TRPCError({ code: 'NOT_FOUND', message: 'Dish not found' });
    if (input.cuisineId && !cuisine) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Unknown cuisine' });
    }

    const normalizedAlias = normalizeAlias(input.alias);
    const row = await ctx.prisma.$transaction(async (tx) => {
      // The same dish under the same menu name at the same restaurant is one menu item,
      // however it was typed; the first person's spelling is kept for display
      const menuItem = await tx.menuItem.upsert({
        where: {
          restaurantId_dishId_normalizedAlias: {
            restaurantId: restaurant.id,
            dishId: dish.id,
            normalizedAlias,
          },
        },
        create: {
          restaurantId: restaurant.id,
          dishId: dish.id,
          alias: cleanAlias(input.alias),
          normalizedAlias,
          createdById: userId,
        },
        update: {},
        select: { id: true },
      });

      return tx.rating.create({
        data: {
          userId,
          menuItemId: menuItem.id,
          tier: input.tier,
          visitedAt: new Date(`${visitedOn}T00:00:00Z`),
          cuisineId: input.cuisineId ?? null,
          photoPath: input.photoPath ?? null,
          note: input.note?.trim() || null,
        },
        select: ratingSelect,
      });
    });

    return toRatingView(row, ctx.storage);
  }),

  /** Your own logs, most recent visit first. */
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
      items: page.map((row) => toRatingView(row, ctx.storage)),
      nextCursor: hasMore ? page[page.length - 1]!.id : null,
    };
  }),
});
