import { randomUUID } from 'node:crypto';
import { Prisma } from '@tastecult/db';
import { byIdInput, dishRequestInput, dishSearchInput } from '@tastecult/shared-types';
import { TRPCError } from '@trpc/server';
import type { Context } from '../context';
import { escapeLike } from '../sql';
import { profileProcedure, publicProcedure, router } from '../trpc';

const MAX_VARIANTS = 50;

const dishRef = { id: true, slug: true, name: true } satisfies Prisma.DishSelect;
const cuisineRef = { id: true, slug: true, name: true } satisfies Prisma.CuisineSelect;

const requestedDishSelect = {
  ...dishRef,
  status: true,
  cuisines: { select: { cuisine: { select: cuisineRef } } },
} satisfies Prisma.DishSelect;

interface DishSearchRow {
  id: string;
  slug: string;
  name: string;
  category: string | null;
  popularity: number;
  otherNames: string[];
  status: 'APPROVED' | 'PENDING';
}

function sortByName<T extends { name: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.name.localeCompare(b.name));
}

/** Approved dishes, plus pending dishes the signed-in user requested themselves. */
function visibleDishes(auth: Context['auth']): Prisma.DishWhereInput {
  return auth
    ? { OR: [{ status: 'APPROVED' }, { status: 'PENDING', requestedById: auth.userId }] }
    : { status: 'APPROVED' };
}

export const dishRouter = router({
  search: publicProcedure.input(dishSearchInput).query(async ({ ctx, input }) => {
    const pattern = `%${escapeLike(input.q)}%`;
    const visible = ctx.auth
      ? Prisma.sql`(d.status = 'APPROVED' OR (d.status = 'PENDING' AND d."requestedById" = ${ctx.auth.userId}))`
      : Prisma.sql`d.status = 'APPROVED'`;
    const cuisineFilter = input.cuisineId
      ? Prisma.sql`AND EXISTS (
          SELECT 1 FROM "DishCuisine" AS dc
          WHERE dc."dishId" = d.id AND dc."cuisineId" = ${input.cuisineId}
        )`
      : Prisma.empty;

    // Matches the name or any other name ("houmous" finds Hummus)
    const rows = await ctx.prisma.$queryRaw<DishSearchRow[]>`
      SELECT d.id, d.slug, d.name, d.category, d.popularity, d."otherNames", d.status::text AS status
      FROM "Dish" AS d
      CROSS JOIN LATERAL (
        SELECT GREATEST(
          similarity(d.name, ${input.q}),
          COALESCE((SELECT max(similarity(n, ${input.q})) FROM unnest(d."otherNames") AS n), 0)
        ) AS score
      ) AS s
      WHERE ${visible}
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
      where: { id: input.id, ...visibleDishes(ctx.auth) },
      select: {
        id: true,
        slug: true,
        name: true,
        status: true,
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

  /**
   * A dish that isn't in the catalogue. It's usable straight away by the person who
   * asked, and stays PENDING (hidden from everyone else) until an admin reviews it.
   */
  request: profileProcedure.input(dishRequestInput).mutation(async ({ ctx, input }) => {
    const name = input.name.replace(/\s+/g, ' ');

    const cuisine = await ctx.prisma.cuisine.findUnique({
      where: { id: input.cuisineId },
      select: { id: true },
    });
    if (!cuisine) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Unknown cuisine' });

    // Reuse before creating: a catalogue dish of the same name, or this user's own
    // earlier request. APPROVED sorts first (enum declaration order).
    const existing = await ctx.prisma.dish.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        OR: [{ status: 'APPROVED' }, { status: 'PENDING', requestedById: ctx.user.id }],
      },
      orderBy: { status: 'asc' },
      select: requestedDishSelect,
    });
    const dish =
      existing ??
      (await ctx.prisma.dish.create({
        data: {
          // Pending slugs can never collide with catalogue slugs
          slug: `pending-${randomUUID()}`,
          name,
          status: 'PENDING',
          requestedById: ctx.user.id,
          cuisines: { create: [{ cuisineId: cuisine.id }] },
        },
        select: requestedDishSelect,
      }));

    return {
      created: existing === null,
      dish: { ...dish, cuisines: sortByName(dish.cuisines.map((c) => c.cuisine)) },
    };
  }),
});
