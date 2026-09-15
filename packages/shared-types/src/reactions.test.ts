import { describe, expect, it } from 'vitest';
import { emptyReactionCounts, REACTION_TYPES, REACTIONS } from './reactions';
import { setReactionInput } from './schemas';

describe('reactions', () => {
  it('has an emoji, a label and a zero count for every type', () => {
    expect(Object.keys(REACTIONS)).toEqual([...REACTION_TYPES]);
    expect(Object.keys(emptyReactionCounts())).toEqual([...REACTION_TYPES]);
    for (const type of REACTION_TYPES) {
      expect(REACTIONS[type].emoji).not.toBe('');
      expect(REACTIONS[type].label).not.toBe('');
    }
  });

  it('accepts known types or null (to clear), and nothing else', () => {
    expect(setReactionInput.safeParse({ ratingId: 'r1', type: 'FIRE' }).success).toBe(true);
    expect(setReactionInput.safeParse({ ratingId: 'r1', type: null }).success).toBe(true);
    expect(setReactionInput.safeParse({ ratingId: 'r1', type: 'fire' }).success).toBe(false);
    expect(setReactionInput.safeParse({ ratingId: 'r1', type: 'ANGRY' }).success).toBe(false);
  });
});
