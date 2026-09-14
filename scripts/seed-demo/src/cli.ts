import path from 'node:path';
import { parseArgs } from 'node:util';
import { createPrismaClient, type PrismaClient } from '@tastecult/db';
import { config as loadEnv } from 'dotenv';
import { DEMO_ID_PREFIX, THEMES } from './data';
import { createSupabaseDemoPhotoStore } from './photos';
import { planDemoData, type DishOption, type VenueOption } from './plan';
import { isLocalDatabaseUrl } from './safety';
import { resetDemoData, seedDemoData } from './seed';

loadEnv({ path: path.resolve(import.meta.dirname, '../../../.env'), quiet: true });

const { values } = parseArgs({
  options: {
    reset: { type: 'boolean', default: false },
    'no-photos': { type: 'boolean', default: false },
  },
});

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl || !isLocalDatabaseUrl(databaseUrl)) {
  console.error(
    'Refusing to run: DATABASE_URL must point at a database on this machine (localhost). ' +
      'Demo data is never written to a hosted database.',
  );
  process.exit(1);
}

const supabaseUrl = process.env.SUPABASE_URL || undefined;
const secretKey =
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || undefined;
const photos =
  values['no-photos'] || !supabaseUrl || !secretKey
    ? null
    : createSupabaseDemoPhotoStore({
        url: supabaseUrl,
        secretKey,
        bucket: process.env.SUPABASE_PHOTOS_BUCKET || 'dish-photos',
      });

const prisma = createPrismaClient(databaseUrl);

try {
  const removed = await resetDemoData(prisma, photos);
  console.log(
    `Removed previous demo data: ${removed.users} people, ${removed.ratings} logs, ` +
      `${removed.menuItems} menu items, ${removed.follows} follows, ${removed.photosRemoved} photos`,
  );

  if (values.reset) {
    console.log('Reset only — nothing new was added.');
  } else {
    const venues = await loadVenues(prisma);
    const { dishes, missing } = await loadDishes(prisma);
    if (missing.length > 0)
      console.log(`Skipped dishes not in the catalogue: ${missing.join(', ')}`);

    const realUsers = await prisma.user.findMany({
      where: { NOT: { id: { startsWith: DEMO_ID_PREFIX } } },
      select: { id: true, username: true },
    });
    const plan = planDemoData({
      venues,
      dishes,
      realUserIds: realUsers.map((user) => user.id),
      now: new Date(),
    });

    if (!photos) console.log('Photos skipped (--no-photos, or no Supabase keys in .env).');
    const result = await seedDemoData(prisma, photos, plan, (done, total) => {
      if (done % 50 === 0 || done === total) console.log(`  photos uploaded: ${done}/${total}`);
    });

    console.log(
      `\nAdded ${result.users} people, ${result.logs} logs across ${result.menuItems} menu items, ` +
        `${result.follows} follows and ${result.photosUploaded} photos.`,
    );
    if (realUsers.length > 0) {
      console.log(
        `Connected to your account(s): ${realUsers.map((user) => user.username).join(', ')}`,
      );
    }
    console.log(`\nTry: http://localhost:3000/u/${plan.users[0]!.username}`);
    const ramen = dishes.find((dish) => dish.name === 'Ramen');
    if (ramen) console.log(`     http://localhost:3000/explore/dish/${ramen.id}`);
    console.log('     http://localhost:3000/feed');
  }
} finally {
  await prisma.$disconnect();
}

async function loadVenues(prisma: PrismaClient): Promise<VenueOption[]> {
  const venues: VenueOption[] = [];
  for (const theme of THEMES) {
    // md5 ordering is stable across runs, so the same restaurants are chosen each time
    const rows = await prisma.$queryRaw<{ id: string; localAuthority: string }[]>`
      SELECT id, "localAuthority"
      FROM "Restaurant"
      WHERE "closedAt" IS NULL
        AND latitude IS NOT NULL
        AND "businessTypeId" IN (1, 7843, 7844)
        AND lower(name) ~ ${theme.venuePattern}
        AND lower(name) !~ ${theme.excludePattern ?? '^$'}
        -- Food courts list every stall in one name ("Noodles / Pizza / Thai / …")
        AND name NOT LIKE '%/%/%'
      ORDER BY md5(name || id)
      LIMIT 400
    `;
    venues.push(...rows.map((row) => ({ ...row, theme: theme.key })));
  }
  return venues;
}

async function loadDishes(
  prisma: PrismaClient,
): Promise<{ dishes: DishOption[]; missing: string[] }> {
  const dishes: DishOption[] = [];
  const missing: string[] = [];
  for (const theme of THEMES) {
    for (const name of theme.dishes) {
      const dish = await prisma.dish.findFirst({
        where: { status: 'APPROVED', name: { equals: name, mode: 'insensitive' } },
        orderBy: { popularity: 'desc' },
        select: {
          id: true,
          name: true,
          popularity: true,
          cuisines: { select: { cuisineId: true } },
        },
      });
      if (!dish) {
        missing.push(name);
        continue;
      }
      dishes.push({
        id: dish.id,
        name: dish.name,
        theme: theme.key,
        popularity: dish.popularity,
        cuisineIds: dish.cuisines.map((c) => c.cuisineId),
      });
    }
  }
  return { dishes, missing };
}
