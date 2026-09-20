import { Prisma, type PrismaClient } from '@tastecult/db';
import {
  cleanAlias,
  isTier,
  latestLogPerUser,
  normalizeAlias,
  tierDistribution,
  type Tier,
  type VisitDishInput,
} from '@tastecult/shared-types';
import { TRPCError } from '@trpc/server';
import type { Context } from './context';
import { socialFor } from './social';
import type { PhotoStorage } from './storage';

/** How many logs or visits a signed-out visitor sees on a restaurant, dish or profile page. */
export const PUBLIC_LOG_PREVIEW = 3;

export const ratingSelect = {
  id: true,
  visitId: true,
  tier: true,
  visitedAt: true,
  note: true,
  createdAt: true,
  cuisine: { select: { id: true, slug: true, name: true } },
  photos: { select: { id: true, path: true }, orderBy: [{ position: 'asc' }, { id: 'asc' }] },
  menuItem: {
    select: {
      id: true,
      alias: true,
      restaurant: { select: { id: true, name: true, postcode: true } },
      dish: { select: { id: true, slug: true, name: true, status: true } },
    },
  },
} satisfies Prisma.RatingSelect;

export const publicLogSelect = {
  ...ratingSelect,
  user: { select: { username: true, displayName: true } },
} satisfies Prisma.RatingSelect;

export type RatingRow = Prisma.RatingGetPayload<{ select: typeof ratingSelect }>;

export function toRatingView<T extends RatingRow>(row: T, storage: PhotoStorage | null) {
  const { visitedAt, photos, ...rest } = row;
  const photoUrls = photos.flatMap((photo) =>
    storage ? [{ id: photo.id, path: photo.path, url: storage.publicUrl(photo.path) }] : [],
  );
  return {
    ...rest,
    // Stored as a DATE, which comes back as midnight UTC — so the ISO date is the day
    visitedAt: visitedAt.toISOString().slice(0, 10),
    photos: photoUrls,
    /** This dish's own first photo, for the many places that show just one. */
    photoUrl: photoUrls[0]?.url ?? null,
  };
}

/** Log views with reaction and comment counts, for any list of logs. */
export async function withSocial<T extends RatingRow & { id: string }>(ctx: Context, rows: T[]) {
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

/** The same rule from a visit's side: a visit is visible if any of its dishes is. */
export function visibleVisits(auth: Context['auth']): Prisma.VisitWhereInput {
  return { ratings: { some: visibleLogs(auth) } };
}

export const visitSelect = {
  id: true,
  visitedAt: true,
  note: true,
  createdAt: true,
  user: { select: { username: true, displayName: true } },
  restaurant: { select: { id: true, name: true, postcode: true } },
  photos: {
    select: { id: true, path: true, position: true, ratingId: true },
    orderBy: [{ position: 'asc' }, { id: 'asc' }],
  },
} satisfies Prisma.VisitSelect;

export type VisitRow = Prisma.VisitGetPayload<{ select: typeof visitSelect }>;

/**
 * A visit with its dishes. The dishes are passed in rather than selected here, because
 * which of them the viewer may see depends on who is asking.
 */
export function toVisitView<D extends { id: string }>(
  row: VisitRow,
  dishes: D[],
  storage: PhotoStorage | null,
) {
  const { visitedAt, photos, ...rest } = row;
  const byRatingId = new Map(dishes.map((dish, index) => [dish.id, index]));
  return {
    ...rest,
    visitedAt: visitedAt.toISOString().slice(0, 10),
    dishes,
    photos: photos.flatMap((photo) =>
      storage
        ? [
            {
              id: photo.id,
              path: photo.path,
              url: storage.publicUrl(photo.path),
              /** Index into `dishes`, or null when the photo is of the visit as a whole. */
              dishIndex: photo.ratingId != null ? (byRatingId.get(photo.ratingId) ?? null) : null,
            },
          ]
        : [],
    ),
  };
}

export async function summarizeLogs(prisma: PrismaClient, where: Prisma.RatingWhereInput) {
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

/**
 * The same dish under the same menu name at the same restaurant is one menu item, however
 * it was typed; the first person's spelling is kept for display.
 */
export async function findOrCreateMenuItem(
  tx: Prisma.TransactionClient,
  userId: string,
  restaurantId: string,
  dishId: string,
  alias: string | null | undefined,
): Promise<string> {
  const normalizedAlias = normalizeAlias(alias);
  const menuItem = await tx.menuItem.upsert({
    where: {
      restaurantId_dishId_normalizedAlias: { restaurantId, dishId, normalizedAlias },
    },
    create: {
      restaurantId,
      dishId,
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
export async function deleteMenuItemsIfUnused(tx: Prisma.TransactionClient, menuItemIds: string[]) {
  if (menuItemIds.length === 0) return;
  await tx.menuItem.deleteMany({ where: { id: { in: menuItemIds }, ratings: { none: {} } } });
}

/**
 * Runs after the database change has been saved, so a storage failure can't undo or block
 * the edit — the worst case is an unused file, which is logged for cleanup.
 */
export async function removePhotos(storage: PhotoStorage | null, paths: string[]) {
  if (paths.length === 0) return;
  if (!storage) {
    console.error(`Photo storage isn't configured, so ${paths.join(', ')} were not deleted`);
    return;
  }
  try {
    await storage.remove(paths);
  } catch (error) {
    console.error(`Could not delete photos ${paths.join(', ')}:`, error);
  }
}

/**
 * Checks the dishes on a visit: every dish must exist and be one this person may log,
 * and every cuisine must be real. Returns them in the order they were sent.
 */
export async function checkVisitDishes(
  prisma: PrismaClient,
  userId: string,
  dishes: VisitDishInput[],
) {
  const dishIds = [...new Set(dishes.map((dish) => dish.dishId))];
  const cuisineIds = [
    ...new Set(dishes.flatMap((dish) => (dish.cuisineId ? [dish.cuisineId] : []))),
  ];

  const [found, cuisines] = await Promise.all([
    // A dish you requested can be logged before it's approved; nobody else's can
    prisma.dish.findMany({
      where: {
        id: { in: dishIds },
        OR: [{ status: 'APPROVED' }, { status: 'PENDING', requestedById: userId }],
      },
      select: { id: true },
    }),
    cuisineIds.length
      ? prisma.cuisine.findMany({ where: { id: { in: cuisineIds } }, select: { id: true } })
      : [],
  ]);

  const knownDishes = new Set(found.map((dish) => dish.id));
  if (knownDishes.size !== dishIds.length) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Dish not found' });
  }
  const knownCuisines = new Set(cuisines.map((cuisine) => cuisine.id));
  if (knownCuisines.size !== cuisineIds.length) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Unknown cuisine' });
  }

  return dishes.map((dish) => ({
    id: dish.id,
    dishId: dish.dishId,
    alias: dish.alias,
    fields: {
      tier: dish.tier,
      cuisineId: dish.cuisineId ?? null,
      note: dish.note?.trim() || null,
    },
  }));
}
