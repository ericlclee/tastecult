import type { AppRouter } from '@tastecult/api';
import { createTRPCClient, httpBatchLink, type TRPCClient, type TRPCLink } from '@trpc/client';
import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';
import superjson from 'superjson';

export type { AppRouter };
export type RouterInputs = inferRouterInputs<AppRouter>;
export type RouterOutputs = inferRouterOutputs<AppRouter>;

export interface ApiClientOptions {
  /** Full tRPC endpoint: the API project's URL, or `/api/trpc` behind the web app's rewrite. */
  url: string;
  /** Supabase access token once sign-in exists; public calls work without one. */
  getAccessToken?: () => string | null | Promise<string | null>;
}

/** Links shared by the plain client and the React Query integration. */
export function createApiLinks(options: ApiClientOptions): TRPCLink<AppRouter>[] {
  return [
    httpBatchLink({
      url: options.url,
      transformer: superjson,
      async headers() {
        const token = await options.getAccessToken?.();
        return token ? { Authorization: `Bearer ${token}` } : {};
      },
    }),
  ];
}

// Explicit return type: the inferred one reaches into the API's internal files
export function createApiClient(options: ApiClientOptions): TRPCClient<AppRouter> {
  return createTRPCClient<AppRouter>({ links: createApiLinks(options) });
}
