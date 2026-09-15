import { commentRouter } from './routers/comment';
import { cuisineRouter } from './routers/cuisine';
import { dishRouter } from './routers/dish';
import { photoRouter } from './routers/photo';
import { ratingRouter } from './routers/rating';
import { reactionRouter } from './routers/reaction';
import { restaurantRouter } from './routers/restaurant';
import { userRouter } from './routers/user';
import { createCallerFactory, publicProcedure, router } from './trpc';

export const appRouter = router({
  health: publicProcedure.query(async ({ ctx }) => {
    await ctx.prisma.$queryRaw`SELECT 1`;
    return { ok: true as const };
  }),
  comment: commentRouter,
  cuisine: cuisineRouter,
  dish: dishRouter,
  photo: photoRouter,
  rating: ratingRouter,
  reaction: reactionRouter,
  restaurant: restaurantRouter,
  user: userRouter,
});

export type AppRouter = typeof appRouter;

/** Calls procedures in-process (tests, and server-side rendering later). */
export const createCaller = createCallerFactory(appRouter);
