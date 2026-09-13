import { describe, expect, it } from 'vitest';
import {
  bayesianScore,
  goodOrBetterShare,
  latestLogPerUser,
  tierDistribution,
  type LogForAggregation,
} from './ranking.js';

const log = (
  userId: string,
  tier: LogForAggregation['tier'],
  visitedAt: string,
  createdAt = visitedAt,
): LogForAggregation => ({
  userId,
  tier,
  visitedAt: new Date(visitedAt),
  createdAt: new Date(createdAt),
});

describe('latestLogPerUser', () => {
  it('counts a re-visiting user once, using their latest visit', () => {
    const result = latestLogPerUser([
      log('a', 2, '2026-01-01'),
      log('a', 5, '2026-03-01'),
      log('b', 3, '2026-02-01'),
    ]);
    expect(result).toHaveLength(2);
    expect(result.find((l) => l.userId === 'a')?.tier).toBe(5);
  });

  it('uses visit date, not insertion order, when a past visit is logged later', () => {
    const result = latestLogPerUser([
      log('a', 4, '2026-03-01', '2026-03-01'),
      log('a', 1, '2026-01-01', '2026-04-01'),
    ]);
    expect(result[0]?.tier).toBe(4);
  });

  it('breaks same-day ties by creation time', () => {
    const result = latestLogPerUser([
      log('a', 1, '2026-03-01', '2026-03-01T12:00:00Z'),
      log('a', 3, '2026-03-01', '2026-03-01T19:00:00Z'),
    ]);
    expect(result[0]?.tier).toBe(3);
  });

  it('returns empty for no logs', () => {
    expect(latestLogPerUser([])).toEqual([]);
  });
});

describe('tierDistribution', () => {
  it('includes zero counts for every tier', () => {
    expect(tierDistribution([5, 5, 3])).toEqual({ 1: 0, 2: 0, 3: 1, 4: 0, 5: 2 });
  });
});

describe('goodOrBetterShare', () => {
  it('counts Good and above', () => {
    expect(goodOrBetterShare([1, 2, 3, 4])).toBe(0.5);
  });

  it('is null with no ratings', () => {
    expect(goodOrBetterShare([])).toBeNull();
  });
});

describe('bayesianScore', () => {
  it('returns the prior mean with no ratings', () => {
    expect(bayesianScore([], 3.2)).toBe(3.2);
  });

  it('keeps a single top rating below many consistently high ratings', () => {
    const single = bayesianScore([5], 3);
    const many = bayesianScore(Array<4>(50).fill(4), 3);
    expect(single).toBeLessThan(many);
  });

  it('converges to the raw mean as ratings grow', () => {
    expect(bayesianScore(Array<5>(10_000).fill(5), 3)).toBeCloseTo(5, 2);
  });

  it('equals the raw mean with zero prior weight', () => {
    expect(bayesianScore([2, 4], 3.5, 0)).toBe(3);
  });

  it('rejects negative prior weight', () => {
    expect(() => bayesianScore([3], 3, -1)).toThrow(RangeError);
  });
});
