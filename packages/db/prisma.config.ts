import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'prisma/config';

// Prisma 7 no longer auto-loads .env; the monorepo keeps one at the root.
loadEnv({ path: path.resolve(import.meta.dirname, '../../.env'), quiet: true });

// Migrations need a session-capable connection, never a transaction pooler: DIRECT_URL
// when set (on Supabase, the session pooler), otherwise DATABASE_URL (local Docker).
// Builds with neither (e.g. the web app on Vercel) still run `prisma generate` for
// types, so a missing URL mustn't fail config loading — migrate commands report it.
const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  ...(url ? { datasource: { url } } : {}),
});
