import { handleTrpcRequest } from '../../../../src/handler';

// Next.js is only the server here: this one route serves the whole tRPC API.
// Prisma's Postgres driver needs Node APIs, and every tRPC call is dynamic.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export { handleTrpcRequest as GET, handleTrpcRequest as POST };
