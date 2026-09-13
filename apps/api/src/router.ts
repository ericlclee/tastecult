import { cuisineRouter } from './routers/cuisine';
import { dishRouter } from './routers/dish';
import { restaurantRouter } from './routers/restaurant';
import { createCallerFactory, publicProcedure, router } from './trpc';

export const appRouter = router({
  health: publicProcedure.query(async ({ ctx }) => {
    await ctx.prisma.$queryRaw`SELECT 1`;
    return { ok: true as const };
  }),
  cuisine: cuisineRouter,
  dish: dishRouter,
  restaurant: restaurantRouter,
});

export type AppRouter = typeof appRouter;

/** Calls procedures in-process (tests, and server-side rendering later). */
export const createCaller = createCallerFactory(appRouter);
