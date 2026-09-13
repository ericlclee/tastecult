import type { NextConfig } from 'next';

// The API project's URL. tRPC calls are proxied through this app, so browsers only
// ever talk to the web app's own origin and no CORS setup is needed.
const apiUrl = process.env.API_URL ?? 'http://localhost:3001';

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source rather than built JavaScript
  transpilePackages: ['@tastecult/api-client'],
  async rewrites() {
    return [{ source: '/api/trpc/:path*', destination: `${apiUrl}/api/trpc/:path*` }];
  },
};

export default nextConfig;
