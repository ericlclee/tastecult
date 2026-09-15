import { Prisma, type PrismaClient } from '@tastecult/db';
import {
  byIdInput,
  cleanAlias,
  createRatingInput,
  cursorPageInput,
  updateRatingInput,
  type CreateRatingInput,
  dishLogsInput,
  isTier,
  latestLogPerUser,
  londonDateString,
  normalizeAlias,
  restaurantLogsInput,
  tierDistribution,
  userPageInput,
  type Tier,
} from '@tastecult/shared-types';
import { TRPCError } from '@trpc/server';
import type { Context } from '../context';
import { isOwnPhotoPath } from '../photos';
import { socialFor } from '../social';
import type { PhotoStorage } from '../storage';
import { profileProcedure, publicProcedure, router } from '../trpc';

/** How many logs a signed-out visitor sees on a restaurant or dish page. */
export const PUBLIC_LOG_PREVIEW = 3;

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

const publicLogSelect = {
  ...ratingSelect,
  user: { select: { username: true, displayName: true } },
} satisfies Prisma.RatingSelect;

type RatingRow = Prisma.RatingGetPayload<{ select: typeof ratingSelect }>;

function toRatingView<T extends RatingRow>(row: T, storage: PhotoStorage | null) {
  const { visitedAt, ...rest } = row;
  return {
    ...rest,
    // Stored as a DATE, which comes back as midnight UTC — so the ISO date is the day
    visitedAt: visitedAt.toISOString().slice(0, 10),
    photoUrl: row.photoPath && storage ? storage.publicUrl(row.photoPath) : null,
  };
}

/** Log views with reaction and comment counts, for any list of logs. */
async function withSocial<T extends RatingRow & { id: string }>(ctx: Context, rows: T[]) {
  const social = await socialFor(
    ctx.prisma,
    rows.map((row) => row.id),
    ctx.auth?.userId ?? null,
  );
  return rows.map((row) => ({ ...toRatingView(row, ctx.storage), social: social.get(row.id)! }));
}

/** Logs of a requested (pending) dish are only visible to the person who requested it. */
export function visibleLogs(auth: Context['auth']): Prisma.RatingWhereInput {
  return {
    menuItem: {
      dish: auth
        ? { OR: [{ status: 'APPROVED' }, { status: 'PENDING', requestedById: auth.userId }] }
        : { status: 'APPROVED' },
    },
  };
}

async function summarizeLogs(prisma: PrismaClient, where: Prisma.RatingWhereInput) {
  const rows = await prisma.rating.findMany({
    where,
    select: { userId: true, menuItemId: true, tier: true, visitedAt: true, createdAt: true },
  });

  const byMenuItem = new Map<string, typeof rows>();
  for (const row of rows) {
    const group = byMenuItem.get(row.menuItemId);
    if (group) group.push(row);
    else byMenuItem.set(row.menuItemId, [row]);
  }

  // Each person's latest log of each menu item counts once in the breakdown, so going
  // back five times doesn't outvote five people who went once
  const counted: Tier[] = [];
  for (const group of byMenuItem.values()) {
    const logs = group.flatMap((row) => (isTier(row.tier) ? [{ ...row, tier: row.tier }] : []));
    for (const log of latestLogPerUser(logs)) counted.push(log.tier);
  }

  return {
    logCount: rows.length,
    peopleCount: new Set(rows.map((row) => row.userId)).size,
    tierCounts: tierDistribution(counted),
  };
}

/** A restaurant or dish page's logs: everything for signed-in users, a preview otherwise. */
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

/** The edit form also needs the dish's cuisines, to offer them in the cuisine picker. */
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
 * Checks what a new or edited log refers to. `currentPhotoPath` is the photo an edited log
 * already has: keeping it is always allowed, while any other photo must be the person's own upload.
 */
async function checkLogFields(
  prisma: PrismaClient,
  userId: string,
  input: CreateRatingInput,
  currentPhotoPath: string | null,
) {
  const today = londonDateString();
  const visitedOn = input.visitedAt ?? today;
  if (visitedOn > today) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: "The visit date can't be in the future",
    });
  }

  if (
    input.photoPath &&
    input.photoPath !== currentPhotoPath &&
    !isOwnPhotoPath(input.photoPath, userId)
  ) {
    throw new TRPCError({ code: 'FORBIDDEN', message: "That photo isn't one of your uploads" });
  }

  const [restaurant, dish, cuisine] = await Promise.all([
    prisma.restaurant.findUnique({ where: { id: input.restaurantId }, select: { id: true } }),
    // A dish you requested can be logged before it's approved; nobody else's can
    prisma.dish.findFirst({
      where: {
        id: input.dishId,
        OR: [{ status: 'APPROVED' }, { status: 'PENDING', requestedById: userId }],
      },
      select: { id: true },
    }),
    input.cuisineId
      ? prisma.cuisine.findUnique({ where: { id: input.cuisineId }, select: { id: true } })
      : null,
  ]);
  if (!restaurant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Restaurant not found' });
  if (!dish) throw new TRPCError({ code: 'NOT_FOUND', message: 'Dish not found' });
  if (input.cuisineId && !cuisine) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Unknown cuisine' });
  }

  return {
    restaurantId: restaurant.id,
    dishId: dish.id,
    fields: {
      tier: input.tier,
      visitedAt: new Date(`${visitedOn}T00:00:00Z`),
      cuisineId: input.cuisineId ?? null,
      note: input.note?.trim() || null,
    },
  };
}

/**
 * The same dish under the same menu name at the same restaurant is one menu item, however
 * it was typed; the first person's spelling is kept for display.
 */
async function findOrCreateMenuItem(
  tx: Prisma.TransactionClient,
  userId: string,
  checked: { restaurantId: string; dishId: string },
  alias: string | null | undefined,
): Promise<string> {
  const normalizedAlias = normalizeAlias(alias);
  const menuItem = await tx.menuItem.upsert({
    where: {
      restaurantId_dishId_normalizedAlias: {
        restaurantId: checked.restaurantId,
        dishId: checked.dishId,
        normalizedAlias,
      },
    },
    create: {
      restaurantId: checked.restaurantId,
      dishId: checked.dishId,
      alias: cleanAlias(alias),
      normalizedAlias,
      createdById: userId,
    },
    update: {},
    select: { id: true },
  });
  return menuItem.id;
}

/** A menu item exists only because someone logged it, so it goes when its last log does. */
async function deleteMenuItemIfUnused(tx: Prisma.TransactionClient, menuItemId: string) {
  await tx.menuItem.deleteMany({ where: { id: menuItemId, ratings: { none: {} } } });
}

/**
 * Runs after the database change has been saved, so a storage failure can't undo or block
 * the edit — the worst case is an unused file, which is logged for cleanup.
 */
async function removePhoto(storage: PhotoStorage | null, path: string) {
  if (!storage) {
    console.error(`Photo storage isn't configured, so ${path} was not deleted`);
    return;
  }
  try {
    await storage.remove([path]);
  } catch (error) {
    console.error(`Could not delete photo ${path}:`, error);
  }
}

async function findOwnLog(prisma: PrismaClient, id: string, userId: string) {
  const log = await prisma.rating.findFirst({
    where: { id, userId },
    select: { id: true, menuItemId: true, photoPath: true },
  });
  // Someone else's log reads as missing, so ids can't be probed
  if (!log) throw new TRPCError({ code: 'NOT_FOUND', message: 'Log not found' });
  return log;
}

export const ratingRouter = router({
  create: profileProcedure.input(createRatingInput).mutation(async ({ ctx, input }) => {
    const userId = ctx.user.id;
    const checked = await checkLogFields(ctx.prisma, userId, input, null);

    const row = await ctx.prisma.$transaction(async (tx) =>
      tx.rating.create({
        data: {
          userId,
          menuItemId: await findOrCreateMenuItem(tx, userId, checked, input.alias),
          photoPath: input.photoPath ?? null,
          ...checked.fields,
        },
        select: ratingSelect,
      }),
    );

    return toRatingView(row, ctx.storage);
  }),

  /** One of your own logs, with what the edit form needs. */
  mineById: profileProcedure.input(byIdInput).query(async ({ ctx, input }) => {
    const row = await ctx.prisma.rating.findFirst({
      where: { id: input.id, userId: ctx.user.id },
      select: editableLogSelect,
    });
    if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'Log not found' });
    return toRatingView(row, ctx.storage);
  }),

  /**
   * Replaces every field of one of your logs. It keeps its id, so reactions and comments
   * stay with it even when the restaurant or dish changes.
   */
  update: profileProcedure.input(updateRatingInput).mutation(async ({ ctx, input }) => {
    const userId = ctx.user.id;
    const existing = await findOwnLog(ctx.prisma, input.id, userId);
    const checked = await checkLogFields(ctx.prisma, userId, input, existing.photoPath);
    const photoPath = input.photoPath === undefined ? existing.photoPath : input.photoPath;

    const row = await ctx.prisma.$transaction(async (tx) => {
      const menuItemId = await findOrCreateMenuItem(tx, userId, checked, input.alias);
      const updated = await tx.rating.update({
        where: { id: existing.id },
        data: { menuItemId, photoPath, ...checked.fields },
        select: ratingSelect,
      });
      if (menuItemId !== existing.menuItemId) {
        await deleteMenuItemIfUnused(tx, existing.menuItemId);
      }
      return updated;
    });

    if (existing.photoPath && existing.photoPath !== photoPath) {
      await removePhoto(ctx.storage, existing.photoPath);
    }
    return toRatingView(row, ctx.storage);
  }),

  /** Deletes one of your logs, with its reactions, comments and photo. */
  delete: profileProcedure.input(byIdInput).mutation(async ({ ctx, input }) => {
    const existing = await findOwnLog(ctx.prisma, input.id, ctx.user.id);

    await ctx.prisma.$transaction(async (tx) => {
      // Reactions and comments cascade with the log
      await tx.rating.delete({ where: { id: existing.id } });
      await deleteMenuItemIfUnused(tx, existing.menuItemId);
    });

    if (existing.photoPath) await removePhoto(ctx.storage, existing.photoPath);
    return { id: existing.id };
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

  /** A person's logs on their profile, with the same preview rule as other pages. */
  forUser: publicProcedure.input(userPageInput).query(async ({ ctx, input }) => {
    const user = await ctx.prisma.user.findUnique({
      where: { username: input.username },
      select: { id: true },
    });
    if (!user) throw new TRPCError({ code: 'NOT_FOUND', message: 'No one has that username' });

    return logsPage(ctx, { AND: [visibleLogs(ctx.auth), { userId: user.id }] }, input);
  }),

  /** Logs from people you follow, most recently logged first. Your own logs aren't included. */
  feed: profileProcedure.input(cursorPageInput).query(async ({ ctx, input }) => {
    const rows = await ctx.prisma.rating.findMany({
      where: {
        AND: [
          visibleLogs(ctx.auth),
          { user: { followers: { some: { followerId: ctx.user.id } } } },
        ],
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: input.limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      select: publicLogSelect,
    });
    const hasMore = rows.length > input.limit;
    const page = hasMore ? rows.slice(0, input.limit) : rows;
    return {
      items: await withSocial(ctx, page),
      nextCursor: hasMore ? page[page.length - 1]!.id : null,
    };
  }),
});
