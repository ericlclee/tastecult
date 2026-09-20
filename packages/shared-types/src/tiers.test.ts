import { describe, expect, it } from 'vitest';
import { MAX_DISHES_PER_VISIT, createVisitInput } from './schemas';
import { isTier, tierLabel, tierSchema } from './tiers';

describe('tiers', () => {
  it('accepts 1–5 and rejects anything else', () => {
    expect(tierSchema.safeParse(1).success).toBe(true);
    expect(tierSchema.safeParse(5).success).toBe(true);
    expect(tierSchema.safeParse(0).success).toBe(false);
    expect(tierSchema.safeParse(6).success).toBe(false);
    expect(tierSchema.safeParse(3.5).success).toBe(false);
  });

  it('labels tiers', () => {
    expect(tierLabel(4)).toBe('Must-order');
    expect(isTier(5)).toBe(true);
    expect(isTier('5')).toBe(false);
  });
});

describe('createVisitInput', () => {
  const valid = { restaurantId: 'r1', dishes: [{ dishId: 'd1', tier: 4 }], photos: [] };

  it('accepts the minimum required fields', () => {
    expect(createVisitInput.safeParse(valid).success).toBe(true);
  });

  it('defaults photos to none', () => {
    const parsed = createVisitInput.safeParse({ restaurantId: 'r1', dishes: valid.dishes });
    expect(parsed.success && parsed.data.photos).toEqual([]);
  });

  it('requires a restaurant and at least one dish, and caps how many', () => {
    expect(createVisitInput.safeParse({ ...valid, restaurantId: undefined }).success).toBe(false);
    expect(createVisitInput.safeParse({ ...valid, dishes: [] }).success).toBe(false);

    const many = (count: number) => Array.from({ length: count }, () => ({ dishId: 'd', tier: 3 }));
    expect(
      createVisitInput.safeParse({ ...valid, dishes: many(MAX_DISHES_PER_VISIT) }).success,
    ).toBe(true);
    expect(
      createVisitInput.safeParse({ ...valid, dishes: many(MAX_DISHES_PER_VISIT + 1) }).success,
    ).toBe(false);
  });

  it("treats each dish's cuisine as optional", () => {
    const withCuisine = (cuisineId: unknown) =>
      createVisitInput.safeParse({ ...valid, dishes: [{ dishId: 'd1', tier: 4, cuisineId }] })
        .success;
    expect(withCuisine('c1')).toBe(true);
    expect(withCuisine(null)).toBe(true);
    expect(withCuisine('')).toBe(false);
  });

  it('requires a calendar date for visitedAt', () => {
    expect(createVisitInput.safeParse({ ...valid, visitedAt: '2026-09-13' }).success).toBe(true);
    expect(createVisitInput.safeParse({ ...valid, visitedAt: '13/09/2026' }).success).toBe(false);
  });

  it('only lets a photo point at a dish the visit has', () => {
    const withIndex = (dishIndex: number | null) =>
      createVisitInput.safeParse({ ...valid, photos: [{ path: 'p.jpg', dishIndex }] }).success;
    expect(withIndex(0)).toBe(true);
    expect(withIndex(null)).toBe(true);
    expect(withIndex(1)).toBe(false);
  });
});
