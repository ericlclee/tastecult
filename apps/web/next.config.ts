import type { NextConfig } from 'next';

// The API project's origin. tRPC calls are proxied through this app, so browsers only
// ever talk to the web app's own origin and no CORS setup is needed.
const apiOrigin = normalizeApiUrl(process.env.API_URL ?? 'http://localhost:3001');

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source rather than built JavaScript
  transpilePackages: ['@tastecult/api-client'],
  async rewrites() {
    return [{ source: '/api/trpc/:path*', destination: `${apiOrigin}/api/trpc/:path*` }];
  },
};

export default nextConfig;

/**
 * Accepts the forms people naturally paste into a dashboard — no scheme
 * ("api.example.com"), a trailing slash, or "/api/trpc" on the end — and returns a
 * bare origin. Without this, a missing "https://" fails the build with Next's
 * "Invalid rewrite found".
 */
function normalizeApiUrl(value: string): string {
  const trimmed = value.trim();
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    return new URL(withScheme).origin;
  } catch {
    throw new Error(`API_URL is not a valid URL: "${value}"`);
  }
}
