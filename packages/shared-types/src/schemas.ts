import { z } from 'zod';
import { REACTION_TYPES } from './reactions';
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

/**
 * Replaces every field of one of your logs, as the edit form sends them all. For the
 * photo, leaving `photoPath` out keeps the current one, `null` removes it and a new
 * upload's path replaces it.
 */
export const updateRatingInput = createRatingInput.extend({ id: idSchema });
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

/** Usernames in URLs and lookups match regardless of capitalisation. */
export const usernameLookupSchema = z.string().trim().toLowerCase().pipe(usernameSchema);

export const usernameInput = z.object({ username: usernameLookupSchema });

/** A page of a person's logs, followers or following. */
export const userPageInput = z.object({
  username: usernameLookupSchema,
  cursor: idSchema.nullish(),
  limit: z.number().int().min(1).max(50).default(20),
});

export const reactionTypeSchema = z.enum(REACTION_TYPES);

/** React to a log, switch to a different reaction, or clear yours with null. */
export const setReactionInput = z.object({
  ratingId: idSchema,
  type: reactionTypeSchema.nullable(),
});

export const COMMENT_MAX_LENGTH = 1000;

export const createCommentInput = z.object({
  ratingId: idSchema,
  body: z.string().trim().min(1, 'Write something first').max(COMMENT_MAX_LENGTH),
});

/** A log's comments, oldest first. Signed-out visitors only ever get a short preview. */
export const commentsPageInput = z.object({
  ratingId: idSchema,
  cursor: idSchema.nullish(),
  limit: z.number().int().min(1).max(50).default(20),
});

/** Logs on a dish page, including the dish's variants. */
export const dishLogsInput = z.object({
  dishId: idSchema,
  cursor: idSchema.nullish(),
  limit: z.number().int().min(1).max(50).default(20),
});
