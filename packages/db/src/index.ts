import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client';

export * from './generated/prisma/client';

export function createPrismaClient(connectionString: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

let shared: PrismaClient | undefined;

/**
 * Process-wide client. Serverless instances reuse it across warm invocations
 * instead of opening a new pool per request.
 */
export function getPrisma(): PrismaClient {
  if (!shared) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    shared = createPrismaClient(url);
  }
  return shared;
}
