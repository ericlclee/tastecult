import { z } from 'zod';
import { tierSchema } from './tiers.js';

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
