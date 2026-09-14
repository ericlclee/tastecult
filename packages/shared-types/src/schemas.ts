import { z } from 'zod';
import { tierSchema } from './tiers';

export const idSchema = z.string().min(1).max(64);

export const usernameSchema = z
  .string()
  .regex(/^[a-z0-9_]{3,30}$/, 'Usernames are 3–30 lowercase letters, numbers or underscores');

/** Visit date as a calendar date (YYYY-MM-DD) — logs record the day, not the time. */
export const visitDateSchema = z.iso.date();

export const createRatingInput = z.object({
  restaurantId: idSchema,
  dishId: idSchema,
  alias: z.string().max(120).nullish(),
  tier: tierSchema,
  // Optional; any cuisine is valid, not only the dish's own
  cuisineId: idSchema.nullish(),
  visitedAt: visitDateSchema.optional(),
  photoPath: z.string().max(512).nullish(),
  note: z.string().max(2000).nullish(),
});
export type CreateRatingInput = z.infer<typeof createRatingInput>;

export const updateRatingInput = z.object({
  id: idSchema,
  tier: tierSchema.optional(),
  cuisineId: idSchema.nullish(),
  visitedAt: visitDateSchema.optional(),
  photoPath: z.string().max(512).nullish(),
  note: z.string().max(2000).nullish(),
});
export type UpdateRatingInput = z.infer<typeof updateRatingInput>;

export const coordinatesSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export const radiusKmSchema = z.number().positive().max(50).default(2);

export const cursorPageInput = z.object({
  cursor: idSchema.nullish(),
  limit: z.number().int().min(1).max(100).default(20),
});

export const byIdInput = z.object({ id: idSchema });

/** Free-text search; two characters minimum so one keystroke doesn't scan every row. */
export const searchQuerySchema = z.string().trim().min(2).max(100);

export const restaurantSearchInput = z.object({
  q: searchQuerySchema,
  /** When given, results include distance and nearer restaurants win ties. */
  near: coordinatesSchema.optional(),
  limit: z.number().int().min(1).max(50).default(20),
});

export const restaurantNearbyInput = coordinatesSchema.extend({
  radiusKm: radiusKmSchema,
  limit: z.number().int().min(1).max(100).default(50),
});

export const dishSearchInput = z.object({
  q: searchQuerySchema,
  cuisineId: idSchema.optional(),
  limit: z.number().int().min(1).max(50).default(20),
});

export const createProfileInput = z.object({
  username: usernameSchema,
  displayName: z.string().trim().min(1).max(60).nullish(),
});

/** A dish missing from the catalogue, requested while logging. */
export const dishRequestInput = z.object({
  name: z.string().trim().min(2).max(80),
  cuisineId: idSchema,
});

/** Logs on a restaurant page. Signed-out visitors only ever get a short preview. */
export const restaurantLogsInput = z.object({
  restaurantId: idSchema,
  cursor: idSchema.nullish(),
  limit: z.number().int().min(1).max(50).default(20),
});

/** Logs on a dish page, including the dish's variants. */
export const dishLogsInput = z.object({
  dishId: idSchema,
  cursor: idSchema.nullish(),
  limit: z.number().int().min(1).max(50).default(20),
});
