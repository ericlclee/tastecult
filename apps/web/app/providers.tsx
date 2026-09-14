'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createApiClient } from '@tastecult/api-client';
import { useEffect, useState, type ReactNode } from 'react';
import { getAccessToken, getSupabase, isSupabaseConfigured } from './supabase';
import { TRPCProvider } from './trpc';

// Same-origin path; next.config.ts rewrites it to the API project
const API_PATH = '/api/trpc';

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000 } } }),
  );
  const [trpcClient] = useState(() => createApiClient({ url: API_PATH, getAccessToken }));

  // Signing in or out changes what the API returns (your profile, your requested
  // dishes), so cached answers from before are stale
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const { data } = getSupabase().auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') void queryClient.invalidateQueries();
    });
    return () => data.subscription.unsubscribe();
  }, [queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        {children}
      </TRPCProvider>
    </QueryClientProvider>
  );
}
