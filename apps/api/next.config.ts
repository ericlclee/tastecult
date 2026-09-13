import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import type { NextConfig } from 'next';

// Next only reads .env files from this app's folder; locally the monorepo keeps one
// at the root. On Vercel the variables come from project settings instead.
loadEnv({ path: path.resolve(process.cwd(), '../../.env'), quiet: true });

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source rather than built JavaScript
  transpilePackages: ['@tastecult/db', '@tastecult/shared-types'],
};

export default nextConfig;
