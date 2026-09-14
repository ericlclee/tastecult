import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import type { Context } from './context';

// superjson keeps Dates (and other non-JSON types) intact between API and clients
const t = initTRPC.context<Context>().create({ transformer: superjson });

export const router = t.router;
export const createCallerFactory = t.createCallerFactory;

/** Anyone, signed in or not. */
export const publicProcedure = t.procedure;

/** Requires a verified Supabase session. */
export const authedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.auth) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Sign in to do this' });
  }
  return next({ ctx: { ...ctx, auth: ctx.auth } });
});

/** Requires a session and a TasteCult profile, which is created once after first sign-in. */
export const profileProcedure = authedProcedure.use(async ({ ctx, next }) => {
  const user = await ctx.prisma.user.findUnique({
    where: { id: ctx.auth.userId },
    select: { id: true, username: true },
  });
  if (!user) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'Choose a username before logging dishes',
    });
  }
  return next({ ctx: { ...ctx, user } });
});
