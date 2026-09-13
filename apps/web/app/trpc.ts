import type { AppRouter } from '@tastecult/api-client';
import { createTRPCContext } from '@trpc/tanstack-react-query';

// Kept in the web app for now; move to @tastecult/api-client once mobile needs it too.
export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();
