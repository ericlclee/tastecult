'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createApiClient } from '@tastecult/api-client';
import { useState, type ReactNode } from 'react';
import { TRPCProvider } from './trpc';

// Same-origin path; next.config.ts rewrites it to the API project
const API_PATH = '/api/trpc';

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000 } } }),
  );
  const [trpcClient] = useState(() => createApiClient({ url: API_PATH }));

  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        {children}
      </TRPCProvider>
    </QueryClientProvider>
  );
}
