import { GOOD_TIER, TIERS, type Tier } from './tiers.js';

export interface LogForAggregation {
  userId: string;
  tier: Tier;
  visitedAt: Date;
  createdAt: Date;
}

/** Menu items need this many distinct raters before appearing in discovery. */
export const MIN_RATERS_FOR_DISCOVERY = 3;

/** How many "virtual" ratings at the prior mean each item starts with. */
export const BAYESIAN_PRIOR_WEIGHT = 5;

/**
 * Each user's latest log only — re-visits update a user's opinion rather than
 * stacking extra votes. Ties on visit date break by creation time.
 */
export function latestLogPerUser<T extends LogForAggregation>(logs: readonly T[]): T[] {
  const latest = new Map<string, T>();
  for (const log of logs) {
    const current = latest.get(log.userId);
    if (!current || compareLogRecency(log, current) > 0) latest.set(log.userId, log);
  }
  return [...latest.values()];
}

function compareLogRecency(a: LogForAggregation, b: LogForAggregation): number {
  return (
    a.visitedAt.getTime() - b.visitedAt.getTime() || a.createdAt.getTime() - b.createdAt.getTime()
  );
}

export type TierDistribution = Record<Tier, number>;

export function tierDistribution(tiers: readonly Tier[]): TierDistribution {
  const dist = Object.fromEntries(TIERS.map((t) => [t.value, 0])) as TierDistribution;
  for (const tier of tiers) dist[tier] += 1;
  return dist;
}

/** Share of ratings at Good or better, 0–1; null when there are no ratings. */
export function goodOrBetterShare(tiers: readonly Tier[]): number | null {
  if (tiers.length === 0) return null;
  return tiers.filter((t) => t >= GOOD_TIER).length / tiers.length;
}

/**
 * Bayesian average: pulls items with few ratings toward the prior mean so a
 * single "Life-changing" can't outrank a dish with fifty "Must-order"s.
 */
export function bayesianScore(
  tiers: readonly Tier[],
  priorMean: number,
  priorWeight: number = BAYESIAN_PRIOR_WEIGHT,
): number {
  if (priorWeight < 0) throw new RangeError('priorWeight must be >= 0');
  const sum = tiers.reduce<number>((acc, t) => acc + t, 0);
  const denominator = priorWeight + tiers.length;
  if (denominator === 0) return priorMean;
  return (priorWeight * priorMean + sum) / denominator;
}
