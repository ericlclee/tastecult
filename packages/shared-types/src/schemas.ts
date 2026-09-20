import { z } from 'zod';
import { REACTION_TYPES } from './reactions';
import { tierSchema } from './tiers';

export const idSchema = z.string().min(1).max(64);

export const usernameSchema = z
  .string()
  .regex(/^[a-z0-9_]{3,30}$/, 'Usernames are 3–30 lowercase letters, numbers or underscores');

/** Visit date as a calendar date (YYYY-MM-DD) — logs record the day, not the time. */
export const visitDateSchema = z.iso.date();

/** Caps on one visit, so a single request can't be used to write unbounded rows. */
export const MAX_DISHES_PER_VISIT = 25;
export const MAX_PHOTOS_PER_VISIT = 12;

/** One dish on a visit. The restaurant and date come from the visit around it. */
export const visitDishInput = z.object({
  /** The existing log's id when editing; absent for a dish being added. */
  id: idSchema.optional(),
  dishId: idSchema,
  alias: z.string().max(120).nullish(),
  tier: tierSchema,
  // Optional; any cuisine is valid, not only the dish's own
  cuisineId: idSchema.nullish(),
  note: z.string().max(2000).nullish(),
});
export type VisitDishInput = z.infer<typeof visitDishInput>;

/**
 * A photo of the visit. `dishIndex` points into the visit's own `dishes` array
 * rather than at a log id, because on a new visit the dishes have no ids yet.
 */
export const visitPhotoInput = z.object({
  path: z.string().min(1).max(512),
  dishIndex: z.number().int().min(0).nullish(),
});
export type VisitPhotoInput = z.infer<typeof visitPhotoInput>;

const visitShape = {
  restaurantId: idSchema,
  visitedAt: visitDateSchema.optional(),
  /** About the meal as a whole; each dish keeps its own note too */
  note: z.string().max(2000).nullish(),
  dishes: z.array(visitDishInput).min(1, 'Log at least one dish').max(MAX_DISHES_PER_VISIT),
  photos: z.array(visitPhotoInput).max(MAX_PHOTOS_PER_VISIT).default([]),
};

/** Every photo that names a dish must name one this visit actually has. */
function checkPhotoLinks(
  value: { dishes: unknown[]; photos: { dishIndex?: number | null }[] },
  ctx: z.RefinementCtx,
) {
  value.photos.forEach((photo, index) => {
    if (photo.dishIndex != null && photo.dishIndex >= value.dishes.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['photos', index, 'dishIndex'],
        message: "That photo points at a dish that isn't on this visit",
      });
    }
  });
}

/** One trip to a restaurant, with every dish eaten on it. */
export const createVisitInput = z.object(visitShape).superRefine(checkPhotoLinks);
export type CreateVisitInput = z.infer<typeof createVisitInput>;

/**
 * Replaces the whole visit, as the edit form sends all of it. Dishes carrying an
 * `id` are updated in place, so their reactions and comments stay with them; ones
 * without are added, and any log left out is deleted. Photos work the same way, by
 * path: those left out are removed from the visit and from storage.
 */
export const updateVisitInput = z
  .object({ ...visitShape, id: idSchema })
  .superRefine(checkPhotoLinks);
export type UpdateVisitInput = z.infer<typeof updateVisitInput>;

/** A page of visits (your own, or someone's profile). */
export const visitPageInput = z.object({
  cursor: idSchema.nullish(),
  limit: z.number().int().min(1).max(50).default(20),
});

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
