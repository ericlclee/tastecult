import { Prisma } from '@tastecult/db';
import { byIdInput, dishSearchInput } from '@tastecult/shared-types';
import { TRPCError } from '@trpc/server';
import { escapeLike } from '../sql';
import { publicProcedure, router } from '../trpc';

const MAX_VARIANTS = 50;

const dishRef = { id: true, slug: true, name: true } satisfies Prisma.DishSelect;
const cuisineRef = { id: true, slug: true, name: true } satisfies Prisma.CuisineSelect;

interface DishSearchRow {
  id: string;
  slug: string;
  name: string;
  category: string | null;
  popularity: number;
  otherNames: string[];
}

function sortByName<T extends { name: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.name.localeCompare(b.name));
}

export const dishRouter = router({
  search: publicProcedure.input(dishSearchInput).query(async ({ ctx, input }) => {
    const pattern = `%${escapeLike(input.q)}%`;
    const cuisineFilter = input.cuisineId
      ? Prisma.sql`AND EXISTS (
          SELECT 1 FROM "DishCuisine" AS dc
          WHERE dc."dishId" = d.id AND dc."cuisineId" = ${input.cuisineId}
        )`
      : Prisma.empty;

    // Matches the name or any other name ("houmous" finds Hummus). Requested
    // (pending) dishes are excluded until sign-in lets requesters see their own.
    const rows = await ctx.prisma.$queryRaw<DishSearchRow[]>`
      SELECT d.id, d.slug, d.name, d.category, d.popularity, d."otherNames"
      FROM "Dish" AS d
      CROSS JOIN LATERAL (
        SELECT GREATEST(
          similarity(d.name, ${input.q}),
          COALESCE((SELECT max(similarity(n, ${input.q})) FROM unnest(d."otherNames") AS n), 0)
        ) AS score
      ) AS s
      WHERE d.status = 'APPROVED'
        AND (
          d.name % ${input.q}
          OR d.name ILIKE ${pattern}
          OR EXISTS (
            SELECT 1 FROM unnest(d."otherNames") AS n WHERE n % ${input.q} OR n ILIKE ${pattern}
          )
        )
        ${cuisineFilter}
      -- Bucket near-equal matches, then order each bucket by London popularity, so a
      -- broad query like "chicken" surfaces well-known dishes before obscure ones
      ORDER BY round(s.score::numeric, 1) DESC, d.popularity DESC, d.name ASC
      LIMIT ${input.limit}
    `;
    if (rows.length === 0) return [];

    const details = await ctx.prisma.dish.findMany({
      where: { id: { in: rows.map((r) => r.id) } },
      select: {
        id: true,
        parent: { select: dishRef },
        cuisines: { select: { cuisine: { select: cuisineRef } } },
      },
    });
    const detailsById = new Map(details.map((d) => [d.id, d]));

    return rows.map((row) => {
      const detail = detailsById.get(row.id);
      return {
        ...row,
        parent: detail?.parent ?? null,
        cuisines: sortByName(detail?.cuisines.map((c) => c.cuisine) ?? []),
      };
    });
  }),

  byId: publicProcedure.input(byIdInput).query(async ({ ctx, input }) => {
    const dish = await ctx.prisma.dish.findFirst({
      where: { id: input.id, status: 'APPROVED' },
      select: {
        id: true,
        slug: true,
        name: true,
        category: true,
        otherNames: true,
        ingredients: true,
        popularity: true,
        parent: { select: dishRef },
        cuisines: {
          select: { cuisine: { select: { ...cuisineRef, region: true, macroRegion: true } } },
        },
        variants: {
          where: { status: 'APPROVED' },
          orderBy: [{ popularity: 'desc' }, { name: 'asc' }],
          take: MAX_VARIANTS,
          select: { ...dishRef, popularity: true },
        },
        _count: { select: { variants: { where: { status: 'APPROVED' } } } },
      },
    });
    if (!dish) throw new TRPCError({ code: 'NOT_FOUND', message: 'Dish not found' });

    const { _count, cuisines, ...rest } = dish;
    return {
      ...rest,
      cuisines: sortByName(cuisines.map((c) => c.cuisine)),
      variantCount: _count.variants,
    };
  }),
});
