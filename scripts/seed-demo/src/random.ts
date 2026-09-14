/** A seeded random source, so the same seed always produces the same demo data. */
export interface Random {
  /** A number in [0, 1). */
  next(): number;
  /** An integer between min and max, inclusive. */
  int(min: number, max: number): number;
  chance(probability: number): boolean;
  pick<T>(items: readonly T[]): T;
  weighted<T>(items: readonly T[], weight: (item: T) => number): T;
  shuffle<T>(items: readonly T[]): T[];
}

/** mulberry32: tiny, fast and good enough for mock data (not for anything secure). */
export function createRandom(seed: number): Random {
  let state = seed >>> 0;

  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    chance: (probability) => next() < probability,
    pick(items) {
      if (items.length === 0) throw new Error('Cannot pick from an empty list');
      return items[Math.floor(next() * items.length)]!;
    },
    weighted(items, weight) {
      const total = items.reduce((sum, item) => sum + weight(item), 0);
      if (items.length === 0 || total <= 0)
        throw new Error('Cannot pick from an empty or zero-weight list');
      let remaining = next() * total;
      for (const item of items) {
        remaining -= weight(item);
        if (remaining < 0) return item;
      }
      return items[items.length - 1]!;
    },
    shuffle(items) {
      const copy = [...items];
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [copy[i], copy[j]] = [copy[j]!, copy[i]!];
      }
      return copy;
    },
  };
}
