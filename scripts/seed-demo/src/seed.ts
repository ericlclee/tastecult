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

  const [follows, ratings, menuItems, users] = await prisma.$transaction([
    prisma.follow.deleteMany({
      where: { OR: [{ followerId: { in: ids } }, { followingId: { in: ids } }] },
    }),
    prisma.rating.deleteMany({ where: { userId: { in: ids } } }),
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

  await prisma.rating.createMany({
    data: plan.logs.map((log) => ({
      userId: log.userId,
      menuItemId: menuItemIds.get(menuItemKey(log))!,
      tier: log.tier,
      visitedAt: new Date(`${log.visitedOn}T00:00:00Z`),
      createdAt: log.createdAt,
      note: log.note,
      cuisineId: log.cuisineId,
      photoPath: photoPaths.get(log) ?? null,
    })),
  });

  const follows = await prisma.follow.createMany({ data: plan.follows, skipDuplicates: true });

  return {
    users: plan.users.length,
    logs: plan.logs.length,
    menuItems: menuItemIds.size,
    follows: follows.count,
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
