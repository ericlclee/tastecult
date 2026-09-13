import { createPrismaClient, type PrismaClient } from './index';

/**
 * Client for integration tests. Refuses anything that doesn't look like a test
 * database, because resetDatabase() wipes every table.
 */
export function createTestPrismaClient(): PrismaClient {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL is not set');
  if (!new URL(url).pathname.includes('test')) {
    throw new Error(`Refusing to use non-test database for tests: ${new URL(url).pathname}`);
  }
  return createPrismaClient(url);
}

export async function resetDatabase(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "Rating", "MenuItem", "DishCuisine", "Dish", "Cuisine", "Restaurant",
      "Follow", "Block", "Report", "MissingPlaceReport", "User"
    RESTART IDENTITY CASCADE
  `);
}
