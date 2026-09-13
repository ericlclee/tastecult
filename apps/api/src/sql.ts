import { Prisma } from '@tastecult/db';
import type { Coordinates } from '@tastecult/shared-types';

/** Escapes LIKE/ILIKE wildcards so input such as "100%" matches literally. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/**
 * Haversine distance in km from `from` to each row's latitude/longitude columns.
 * NULL when no location is given or the row has no coordinates.
 */
export function distanceKmSql(from: Coordinates | undefined): Prisma.Sql {
  if (!from) return Prisma.sql`NULL::double precision`;
  const lat = Prisma.sql`${from.lat}::double precision`;
  const lng = Prisma.sql`${from.lng}::double precision`;
  // least(1, ...) guards asin against floating-point values just above 1. least()
  // ignores NULLs, so rows without coordinates must short-circuit first — otherwise
  // they come out as ~20,000 km instead of NULL.
  return Prisma.sql`(
    CASE WHEN latitude IS NULL OR longitude IS NULL THEN NULL
    ELSE 6371 * 2 * asin(least(1, sqrt(
      power(sin(radians(latitude - ${lat}) / 2), 2)
      + cos(radians(${lat})) * cos(radians(latitude))
        * power(sin(radians(longitude - ${lng}) / 2), 2)
    )))
    END
  )`;
}
