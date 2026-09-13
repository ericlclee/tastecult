import { getPrisma, type PrismaClient } from '@tastecult/db';

export interface Context {
  prisma: PrismaClient;
}

// Sign-in isn't built yet; this is where the verified Supabase user will be added.
export function createContext(): Context {
  return { prisma: getPrisma() };
}
