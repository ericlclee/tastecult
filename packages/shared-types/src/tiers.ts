import { z } from 'zod';

// Stored as Int 1–5 so tiers can be averaged and ranked; labels live only here.
export const TIERS = [
  { value: 1, key: 'skip', label: 'Skip' },
  { value: 2, key: 'fine', label: 'Fine' },
  { value: 3, key: 'good', label: 'Good' },
  { value: 4, key: 'must-order', label: 'Must-order' },
  { value: 5, key: 'life-changing', label: 'Life-changing' },
] as const;

export type Tier = (typeof TIERS)[number]['value'];
export type TierKey = (typeof TIERS)[number]['key'];

export const MIN_TIER = 1;
export const MAX_TIER = 5;
export const GOOD_TIER: Tier = 3;

export const tierSchema = z
  .number()
  .int()
  .min(MIN_TIER)
  .max(MAX_TIER)
  .transform((n) => n as Tier);

export function isTier(value: unknown): value is Tier {
  return (
    typeof value === 'number' && Number.isInteger(value) && value >= MIN_TIER && value <= MAX_TIER
  );
}

export function tierLabel(tier: Tier): string {
  const found = TIERS.find((t) => t.value === tier);
  if (!found) throw new RangeError(`Invalid tier: ${String(tier)}`);
  return found.label;
}
