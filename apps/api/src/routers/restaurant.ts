import { Prisma } from '@tastecult/db';
import {
  boundingBox,
  byIdInput,
  restaurantNearbyInput,
  restaurantSearchInput,
} from '@tastecult/shared-types';
import { TRPCError } from '@trpc/server';
import { distanceKmSql, escapeLike } from '../sql';
import { publicProcedure, router } from '../trpc';

export interface RestaurantSummary {
  id: string;
  name: string;
  address: string | null;
  postcode: string | null;
  latitude: number | null;
  longitude: number | null;
  businessType: string;
  hygieneRating: string | null;
  /** From the caller's location; null without a location or when FHRS has no coordinates. */
  distanceKm: number | null;
}

const summaryColumns = Prisma.sql`
  id, name, address, postcode, latitude, longitude, "businessType", "hygieneRating"
`;

export const restaurantRouter = router({
  search: publicProcedure.input(restaurantSearchInput).query(({ ctx, input }) => {
    const pattern = `%${escapeLike(input.q)}%`;
    // Trigram similarity catches typos ("dishom"); ILIKE catches short substrings
    // that similarity scores too low. Both use the name's GIN trigram index.
    return ctx.prisma.$queryRaw<RestaurantSummary[]>`
      SELECT ${summaryColumns}, ${distanceKmSql(input.near)} AS "distanceKm"
      FROM "Restaurant"
      WHERE "closedAt" IS NULL
        AND (name % ${input.q} OR name ILIKE ${pattern})
      ORDER BY similarity(name, ${input.q}) DESC, "distanceKm" ASC NULLS LAST, name ASC
      LIMIT ${input.limit}
    `;
  }),

  nearby: publicProcedure.input(restaurantNearbyInput).query(({ ctx, input }) => {
    const origin = { lat: input.lat, lng: input.lng };
    const box = boundingBox(origin, input.radiusKm);
    // The box uses the (latitude, longitude) index; exact distance then trims its corners.
    // Restaurants without coordinates can't be placed, so they never appear here.
    return ctx.prisma.$queryRaw<RestaurantSummary[]>`
      SELECT * FROM (
        SELECT ${summaryColumns}, ${distanceKmSql(origin)} AS "distanceKm"
        FROM "Restaurant"
        WHERE "closedAt" IS NULL
          AND latitude BETWEEN ${box.minLat} AND ${box.maxLat}
          AND longitude BETWEEN ${box.minLng} AND ${box.maxLng}
      ) AS nearby
      WHERE "distanceKm" <= ${input.radiusKm}
      ORDER BY "distanceKm" ASC, name ASC
      LIMIT ${input.limit}
    `;
  }),

  byId: publicProcedure.input(byIdInput).query(async ({ ctx, input }) => {
    const restaurant = await ctx.prisma.restaurant.findUnique({
      where: { id: input.id },
      select: {
        id: true,
        fhrsId: true,
        name: true,
        address: true,
        postcode: true,
        latitude: true,
        longitude: true,
        businessType: true,
        localAuthority: true,
        hygieneRating: true,
        closedAt: true,
        // Ratings per menu item come with the journal/stats endpoints
        menuItems: {
          where: { dish: { status: 'APPROVED' } },
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            alias: true,
            dish: { select: { id: true, slug: true, name: true } },
          },
        },
      },
    });
    if (!restaurant) throw new TRPCError({ code: 'NOT_FOUND', message: 'Restaurant not found' });
    return restaurant;
  }),
});
