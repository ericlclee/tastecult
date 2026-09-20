import { Prisma, type PrismaClient } from '@tastecult/db';
import {
  byIdInput,
  createVisitInput,
  cursorPageInput,
  londonDateString,
  updateVisitInput,
  userPageInput,
  type CreateVisitInput,
} from '@tastecult/shared-types';
import { TRPCError } from '@trpc/server';
import type { Context } from '../context';
import {
  PUBLIC_LOG_PREVIEW,
  checkVisitDishes,
  deleteMenuItemsIfUnused,
  findOrCreateMenuItem,
  publicLogSelect,
  ratingSelect,
  removePhotos,
  toVisitView,
  visibleLogs,
  visibleVisits,
  visitSelect,
  withSocial,
} from '../logs';
import { isOwnPhotoPath } from '../photos';
import { profileProcedure, publicProcedure, router } from '../trpc';

/** The edit form also needs each dish's cuisines, to offer them in the cuisine picker. */
const editableLogSelect = {
  ...ratingSelect,
  menuItem: {
    select: {
      ...ratingSelect.menuItem.select,
      dish: {
        select: {
          ...ratingSelect.menuItem.select.dish.select,
          cuisines: { select: { cuisine: { select: { id: true, name: true } } } },
        },
      },
    },
  },
} satisfies Prisma.RatingSelect;

/**
 * Checks a visit's own fields. `currentPhotoPaths` are the photos the visit already has:
 * keeping one is always allowed, while any other must be the caller's own upload.
 */
async function checkVisitFields(
  prisma: PrismaClient,
  userId: string,
  input: CreateVisitInput,
  currentPhotoPaths: Set<string>,
) {
  const today = londonDateString();
  const visitedOn = input.visitedAt ?? today;
  if (visitedOn > today) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: "The visit date can't be in the future" });
  }

  const paths = input.photos.map((photo) => photo.path);
  if (new Set(paths).size !== paths.length) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'That photo is on this visit twice' });
  }
  const newPaths = paths.filter((path) => !currentPhotoPaths.has(path));
  for (const path of newPaths) {
    if (!isOwnPhotoPath(path, userId)) {
      throw new TRPCError({ code: 'FORBIDDEN', message: "That photo isn't one of your uploads" });
    }
  }
  // A photo lives on one visit; `path` is unique, so catch this before the insert does
  if (newPaths.length > 0) {
    const taken = await prisma.visitPhoto.findFirst({
      where: { path: { in: newPaths } },
      select: { path: true },
    });
    if (taken) {
      throw new TRPCError({
        code: 'CONFLICT',
        message: 'That photo is already on another visit',
      });
    }
  }

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: input.restaurantId },
    select: { id: true },
  });
  if (!restaurant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Restaurant not found' });

  return {
    restaurantId: restaurant.id,
    visitedAt: new Date(`${visitedOn}T00:00:00Z`),
    note: input.note?.trim() || null,
    dishes: await checkVisitDishes(prisma, userId, input.dishes),
  };
}

async function findOwnVisit(prisma: PrismaClient, id: string, userId: string) {
  const visit = await prisma.visit.findFirst({
    where: { id, userId },
    select: {
      id: true,
      ratings: { select: { id: true, menuItemId: true } },
      photos: { select: { id: true, path: true } },
    },
  });
  // Someone else's visit reads as missing, so ids can't be probed
  if (!visit) throw new TRPCError({ code: 'NOT_FOUND', message: 'Visit not found' });
  return visit;
}

/** Loads visits with the dishes on them the viewer is allowed to see. */
async function visitViews(ctx: Context, rows: Awaited<ReturnType<typeof loadVisits>>) {
  if (rows.length === 0) return [];
  const logs = await ctx.prisma.rating.findMany({
    where: { AND: [visibleLogs(ctx.auth), { visitId: { in: rows.map((row) => row.id) } }] },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: publicLogSelect,
  });
  const withCounts = await withSocial(ctx, logs);

  const byVisit = new Map<string, typeof withCounts>();
  for (const [index, log] of logs.entries()) {
    const group = byVisit.get(log.visitId);
    if (group) group.push(withCounts[index]!);
    else byVisit.set(log.visitId, [withCounts[index]!]);
  }
  // A visit whose every dish is hidden from this viewer drops out entirely
  return rows.flatMap((row) => {
    const dishes = byVisit.get(row.id);
    return dishes?.length ? [toVisitView(row, dishes, ctx.storage)] : [];
  });
}

function loadVisits(prisma: PrismaClient, args: Prisma.VisitFindManyArgs) {
  return prisma.visit.findMany({ ...args, select: visitSelect });
}

/** A cursor-paged list of visits, with the signed-out preview rule. */
async function visitsPage(
  ctx: Context,
  where: Prisma.VisitWhereInput,
  input: { cursor?: string | null; limit: number },
  orderBy: Prisma.VisitOrderByWithRelationInput[],
  { preview = false }: { preview?: boolean } = {},
) {
  const signedIn = ctx.auth !== null;
  const take = preview && !signedIn ? PUBLIC_LOG_PREVIEW : input.limit;

  const rows = await loadVisits(ctx.prisma, {
    where,
    orderBy,
    take: take + 1,
    // Signed-out visitors only ever get the first page, whatever cursor they send
    ...((!preview || signedIn) && input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
  });

  const hasMore = rows.length > take;
  const page = hasMore ? rows.slice(0, take) : rows;
  return {
    items: await visitViews(ctx, page),
    nextCursor: hasMore && (!preview || signedIn) ? page[page.length - 1]!.id : null,
    /** True when a signed-out visitor is seeing a preview of a longer list. */
    limited: preview && !signedIn && hasMore,
  };
}

export const visitRouter = router({
  /** Logs one trip to a restaurant, with every dish eaten on it. */
  create: profileProcedure.input(createVisitInput).mutation(async ({ ctx, input }) => {
    const userId = ctx.user.id;
    const checked = await checkVisitFields(ctx.prisma, userId, input, new Set());

    const visitId = await ctx.prisma.$transaction(async (tx) => {
      const visit = await tx.visit.create({
        data: {
          userId,
          restaurantId: checked.restaurantId,
          visitedAt: checked.visitedAt,
          note: checked.note,
        },
        select: { id: true },
      });

      // Created one at a time, in order, so each dish's index maps to its new log id
      const ratingIds: string[] = [];
      for (const dish of checked.dishes) {
        const menuItemId = await findOrCreateMenuItem(
          tx,
          userId,
          checked.restaurantId,
          dish.dishId,
          dish.alias,
        );
        const row = await tx.rating.create({
          data: {
            visitId: visit.id,
            userId,
            menuItemId,
            visitedAt: checked.visitedAt,
            ...dish.fields,
          },
          select: { id: true },
        });
        ratingIds.push(row.id);
      }

      if (input.photos.length > 0) {
        await tx.visitPhoto.createMany({
          data: input.photos.map((photo, position) => ({
            visitId: visit.id,
            ratingId: photo.dishIndex != null ? (ratingIds[photo.dishIndex] ?? null) : null,
            path: photo.path,
            position,
          })),
        });
      }
      return visit.id;
    });

    return (await visitViews(ctx, await loadVisits(ctx.prisma, { where: { id: visitId } })))[0]!;
  }),

  /** One of your own visits, with what the edit form needs. */
  mineById: profileProcedure.input(byIdInput).query(async ({ ctx, input }) => {
    const row = await ctx.prisma.visit.findFirst({
      where: { id: input.id, userId: ctx.user.id },
      select: visitSelect,
    });
    if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'Visit not found' });

    const logs = await ctx.prisma.rating.findMany({
      where: { visitId: row.id },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: editableLogSelect,
    });
    return toVisitView(row, await withSocial(ctx, logs), ctx.storage);
  }),

  /** Anyone's visit, subject to the same visibility rule as its dishes. */
  byId: publicProcedure.input(byIdInput).query(async ({ ctx, input }) => {
    const rows = await loadVisits(ctx.prisma, {
      where: { AND: [visibleVisits(ctx.auth), { id: input.id }] },
    });
    const view = (await visitViews(ctx, rows))[0];
    if (!view) throw new TRPCError({ code: 'NOT_FOUND', message: 'Visit not found' });
    return view;
  }),

  /**
   * Replaces a whole visit. Dishes sent with an `id` keep it, so their reactions and
   * comments stay with them; dishes left out are deleted, as are photos left out.
   */
  update: profileProcedure.input(updateVisitInput).mutation(async ({ ctx, input }) => {
    const userId = ctx.user.id;
    const existing = await findOwnVisit(ctx.prisma, input.id, userId);
    const currentPaths = new Map(existing.photos.map((photo) => [photo.path, photo.id]));
    const checked = await checkVisitFields(ctx.prisma, userId, input, new Set(currentPaths.keys()));

    const existingIds = new Set(existing.ratings.map((rating) => rating.id));
    for (const dish of checked.dishes) {
      if (dish.id && !existingIds.has(dish.id)) {
        throw new TRPCError({ code: 'NOT_FOUND', message: "That log isn't on this visit" });
      }
    }
    const keptIds = new Set(checked.dishes.flatMap((dish) => (dish.id ? [dish.id] : [])));
    const removedRatings = existing.ratings.filter((rating) => !keptIds.has(rating.id));

    await ctx.prisma.$transaction(async (tx) => {
      await tx.visit.update({
        where: { id: existing.id },
        data: {
          restaurantId: checked.restaurantId,
          visitedAt: checked.visitedAt,
          note: checked.note,
        },
      });

      const ratingIds: string[] = [];
      for (const dish of checked.dishes) {
        const menuItemId = await findOrCreateMenuItem(
          tx,
          userId,
          checked.restaurantId,
          dish.dishId,
          dish.alias,
        );
        const data = { menuItemId, visitedAt: checked.visitedAt, ...dish.fields };
        if (dish.id) {
          await tx.rating.update({ where: { id: dish.id }, data });
          ratingIds.push(dish.id);
        } else {
          const row = await tx.rating.create({
            data: { visitId: existing.id, userId, ...data },
            select: { id: true },
          });
          ratingIds.push(row.id);
        }
      }

      if (removedRatings.length > 0) {
        // Their reactions and comments cascade; photos of them fall back to the visit
        await tx.rating.deleteMany({ where: { id: { in: removedRatings.map((r) => r.id) } } });
      }

      // Photos are matched by path: the ones sent stay (repositioned and relinked),
      // any the visit had that weren't sent go
      const sentPaths = new Set(input.photos.map((photo) => photo.path));
      const goneIds = existing.photos
        .filter((photo) => !sentPaths.has(photo.path))
        .map((photo) => photo.id);
      if (goneIds.length > 0) await tx.visitPhoto.deleteMany({ where: { id: { in: goneIds } } });

      for (const [position, photo] of input.photos.entries()) {
        const ratingId = photo.dishIndex != null ? (ratingIds[photo.dishIndex] ?? null) : null;
        const currentId = currentPaths.get(photo.path);
        if (currentId) {
          await tx.visitPhoto.update({ where: { id: currentId }, data: { position, ratingId } });
        } else {
          await tx.visitPhoto.create({
            data: { visitId: existing.id, path: photo.path, position, ratingId },
          });
        }
      }

      await deleteMenuItemsIfUnused(
        tx,
        existing.ratings.map((rating) => rating.menuItemId),
      );
    });

    const removedPaths = existing.photos
      .filter((photo) => !input.photos.some((sent) => sent.path === photo.path))
      .map((photo) => photo.path);
    await removePhotos(ctx.storage, removedPaths);

    return (
      await visitViews(ctx, await loadVisits(ctx.prisma, { where: { id: existing.id } }))
    )[0]!;
  }),

  /** Deletes a visit with every dish on it, and their reactions, comments and photos. */
  delete: profileProcedure.input(byIdInput).mutation(async ({ ctx, input }) => {
    const existing = await findOwnVisit(ctx.prisma, input.id, ctx.user.id);

    await ctx.prisma.$transaction(async (tx) => {
      // Logs, photos, reactions and comments all cascade with the visit
      await tx.visit.delete({ where: { id: existing.id } });
      await deleteMenuItemsIfUnused(
        tx,
        existing.ratings.map((rating) => rating.menuItemId),
      );
    });

    await removePhotos(
      ctx.storage,
      existing.photos.map((photo) => photo.path),
    );
    return { id: existing.id };
  }),

  /** Your own visits, most recent first. */
  mine: profileProcedure
    .input(cursorPageInput)
    .query(({ ctx, input }) =>
      visitsPage(ctx, { userId: ctx.user.id }, input, [
        { visitedAt: 'desc' },
        { createdAt: 'desc' },
        { id: 'desc' },
      ]),
    ),

  /** A person's visits on their profile, with the signed-out preview rule. */
  forUser: publicProcedure.input(userPageInput).query(async ({ ctx, input }) => {
    const user = await ctx.prisma.user.findUnique({
      where: { username: input.username },
      select: { id: true },
    });
    if (!user) throw new TRPCError({ code: 'NOT_FOUND', message: 'No one has that username' });

    return visitsPage(
      ctx,
      { AND: [visibleVisits(ctx.auth), { userId: user.id }] },
      input,
      [{ visitedAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
      { preview: true },
    );
  }),

  /** Visits from people you follow, most recently logged first. Yours aren't included. */
  feed: profileProcedure.input(cursorPageInput).query(({ ctx, input }) =>
    visitsPage(
      ctx,
      {
        AND: [
          visibleVisits(ctx.auth),
          { user: { followers: { some: { followerId: ctx.user.id } } } },
        ],
      },
      input,
      [{ createdAt: 'desc' }, { id: 'desc' }],
    ),
  ),
});
