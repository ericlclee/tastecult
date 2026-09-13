import { publicProcedure, router } from '../trpc';

export const cuisineRouter = router({
  list: publicProcedure.query(async ({ ctx }) => {
    const cuisines = await ctx.prisma.cuisine.findMany({
      orderBy: [{ macroRegion: 'asc' }, { region: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        slug: true,
        name: true,
        region: true,
        macroRegion: true,
        _count: { select: { dishes: { where: { dish: { status: 'APPROVED' } } } } },
      },
    });
    return cuisines.map(({ _count, ...cuisine }) => ({ ...cuisine, dishCount: _count.dishes }));
  }),
});
