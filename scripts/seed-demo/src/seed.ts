import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@tastecult/db';
import { cleanAlias, normalizeAlias } from '@tastecult/shared-types';
import { DEMO_ID_PREFIX, DEMO_PHOTO_FOLDER } from './data';
import { demoPhotoPath, placeholderJpeg, type DemoPhotoStore } from './photos';
import type { DemoPlan, PlannedLog } from './plan';

const PHOTO_UPLOAD_CONCURRENCY = 6;

/**
 * Removes everything the demo seed created: demo people, their logs and follows, menu
 * items only they used, and their photos. Real accounts' own logs are never touched.
 */
export async function resetDemoData(prisma: PrismaClient, photos: DemoPhotoStore | null) {
  const demoUsers = await prisma.user.findMany({
    where: { id: { startsWith: DEMO_ID_PREFIX } },
    select: { id: true },
  });
  const ids = demoUsers.map((user) => user.id);

  const [follows, ratings, , menuItems, users] = await prisma.$transaction([
    prisma.follow.deleteMany({
      where: { OR: [{ followerId: { in: ids } }, { followingId: { in: ids } }] },
    }),
    // Deleting the visits takes their logs and photo rows with them
    prisma.rating.deleteMany({ where: { userId: { in: ids } } }),
    prisma.visit.deleteMany({ where: { userId: { in: ids } } }),
    // Menu items a real person has also logged stay; only demo-only ones go
    prisma.menuItem.deleteMany({ where: { createdById: { in: ids }, ratings: { none: {} } } }),
    prisma.user.deleteMany({ where: { id: { in: ids } } }),
  ]);

  const photosRemoved = photos ? await photos.removeFolder(DEMO_PHOTO_FOLDER) : 0;
  return {
    users: users.count,
    ratings: ratings.count,
    menuItems: menuItems.count,
    follows: follows.count,
    photosRemoved,
  };
}

export async function seedDemoData(
  prisma: PrismaClient,
  photos: DemoPhotoStore | null,
  plan: DemoPlan,
  onPhotoProgress?: (done: number, total: number) => void,
) {
  await prisma.user.createMany({ data: plan.users });

  // The same dish under the same menu name at a restaurant is one menu item
  const menuItemKey = (log: PlannedLog) =>
    `${log.restaurantId}|${log.dishId}|${normalizeAlias(log.alias)}`;
  const menuItemIds = new Map<string, string>();
  for (const log of plan.logs) {
    const key = menuItemKey(log);
    if (menuItemIds.has(key)) continue;
    const normalizedAlias = normalizeAlias(log.alias);
    const item = await prisma.menuItem.upsert({
      where: {
        restaurantId_dishId_normalizedAlias: {
          restaurantId: log.restaurantId,
          dishId: log.dishId,
          normalizedAlias,
        },
      },
      create: {
        restaurantId: log.restaurantId,
        dishId: log.dishId,
        alias: cleanAlias(log.alias),
        normalizedAlias,
        createdById: log.userId,
      },
      update: {},
      select: { id: true },
    });
    menuItemIds.set(key, item.id);
  }

  // Upload photos before creating logs, so no log ever points at a missing image
  const photoPaths = new Map<PlannedLog, string>();
  if (photos) {
    const withPhotos = plan.logs.filter((log) => log.photoHue !== null);
    let done = 0;
    await runInPool(withPhotos, PHOTO_UPLOAD_CONCURRENCY, async (log) => {
      const path = demoPhotoPath(log.userId);
      await photos.upload(path, placeholderJpeg(log.photoHue!));
      photoPaths.set(log, path);
      onPhotoProgress?.(++done, withPhotos.length);
    });
  }

  // Logs of one restaurant on one day by one person are one visit, so the demo
  // data exercises multi-dish visits the same way real logging produces them
  const visitIds = new Map<string, string>();
  const visits: {
    id: string;
    userId: string;
    restaurantId: string;
    visitedAt: Date;
    createdAt: Date;
    updatedAt: Date;
  }[] = [];
  for (const log of plan.logs) {
    const key = `${log.userId}|${log.restaurantId}|${log.visitedOn}`;
    if (visitIds.has(key)) continue;
    const id = randomUUID();
    visitIds.set(key, id);
    visits.push({
      id,
      userId: log.userId,
      restaurantId: log.restaurantId,
      visitedAt: new Date(`${log.visitedOn}T00:00:00Z`),
      createdAt: log.createdAt,
      updatedAt: log.createdAt,
    });
  }
  const visitIdFor = (log: PlannedLog) =>
    visitIds.get(`${log.userId}|${log.restaurantId}|${log.visitedOn}`)!;
  await prisma.visit.createMany({ data: visits });

  // Ids chosen here so reactions and comments can point at logs created in bulk
  const logIds = plan.logs.map(() => randomUUID());
  await prisma.rating.createMany({
    data: plan.logs.map((log, index) => ({
      id: logIds[index]!,
      visitId: visitIdFor(log),
      userId: log.userId,
      menuItemId: menuItemIds.get(menuItemKey(log))!,
      tier: log.tier,
      visitedAt: new Date(`${log.visitedOn}T00:00:00Z`),
      createdAt: log.createdAt,
      note: log.note,
      cuisineId: log.cuisineId,
    })),
  });

  await prisma.visitPhoto.createMany({
    data: plan.logs.flatMap((log, index) => {
      const path = photoPaths.get(log);
      return path ? [{ visitId: visitIdFor(log), ratingId: logIds[index]!, path }] : [];
    }),
  });

  const follows = await prisma.follow.createMany({ data: plan.follows, skipDuplicates: true });

  const reactions = await prisma.reaction.createMany({
    data: plan.reactions.map((reaction) => ({
      ratingId: logIds[reaction.logIndex]!,
      userId: reaction.userId,
      type: reaction.type,
    })),
  });
  const comments = await prisma.comment.createMany({
    data: plan.comments.map((comment) => ({
      ratingId: logIds[comment.logIndex]!,
      userId: comment.userId,
      body: comment.body,
      createdAt: comment.createdAt,
    })),
  });

  return {
    users: plan.users.length,
    visits: visits.length,
    logs: plan.logs.length,
    menuItems: menuItemIds.size,
    follows: follows.count,
    reactions: reactions.count,
    comments: comments.count,
    photosUploaded: photoPaths.size,
  };
}

async function runInPool<T>(items: T[], concurrency: number, work: (item: T) => Promise<void>) {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const item = items[next++]!;
      await work(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
}
