import { describe, expect, it } from 'vitest';
import { createRatingInput } from './schemas';
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

describe('createRatingInput', () => {
  const valid = { restaurantId: 'r1', dishId: 'd1', tier: 4 };

  it('accepts the minimum required fields', () => {
    expect(createRatingInput.safeParse(valid).success).toBe(true);
  });

  it('requires restaurant and dish', () => {
    expect(createRatingInput.safeParse({ ...valid, restaurantId: undefined }).success).toBe(false);
    expect(createRatingInput.safeParse({ ...valid, dishId: undefined }).success).toBe(false);
  });

  it('treats cuisine as optional', () => {
    expect(createRatingInput.safeParse({ ...valid, cuisineId: 'c1' }).success).toBe(true);
    expect(createRatingInput.safeParse({ ...valid, cuisineId: null }).success).toBe(true);
    expect(createRatingInput.safeParse({ ...valid, cuisineId: '' }).success).toBe(false);
  });

  it('requires a calendar date for visitedAt', () => {
    expect(createRatingInput.safeParse({ ...valid, visitedAt: '2026-09-13' }).success).toBe(true);
    expect(createRatingInput.safeParse({ ...valid, visitedAt: '13/09/2026' }).success).toBe(false);
  });
});
