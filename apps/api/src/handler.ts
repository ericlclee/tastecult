import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { createContext } from './context';
import { appRouter } from './router';

export const TRPC_ENDPOINT = '/api/trpc';

/** Web-standard Request -> Response handler, so it isn't tied to one hosting framework. */
export function handleTrpcRequest(req: Request): Promise<Response> {
  return fetchRequestHandler({
    endpoint: TRPC_ENDPOINT,
    req,
    router: appRouter,
    createContext,
    onError({ path, error }) {
      // Client errors (bad input, not found) are expected; only log real failures
      if (error.code === 'INTERNAL_SERVER_ERROR') {
        console.error(`tRPC ${path ?? '<unknown>'} failed:`, error);
      }
    },
  });
}
