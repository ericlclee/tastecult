import { describe, expect, it } from 'vitest';
import { cleanAlias, normalizeAlias, slugify } from './normalize';

describe('normalizeAlias', () => {
  it('treats casing and whitespace variants as the same alias', () => {
    expect(normalizeAlias('  Spicy   Miso Ramen ')).toBe(normalizeAlias('spicy miso ramen'));
  });

  it('keeps genuinely different aliases distinct', () => {
    expect(normalizeAlias('Tonkotsu ramen')).not.toBe(normalizeAlias('Spicy miso ramen'));
  });

  it('maps missing or blank aliases to empty string', () => {
    expect(normalizeAlias(null)).toBe('');
    expect(normalizeAlias(undefined)).toBe('');
    expect(normalizeAlias('   ')).toBe('');
  });

  it('folds full-width characters via NFKC', () => {
    expect(normalizeAlias('ＲＡＭＥＮ')).toBe('ramen');
  });
});

describe('cleanAlias', () => {
  it('keeps casing but collapses whitespace', () => {
    expect(cleanAlias('  Spicy   Miso Ramen ')).toBe('Spicy Miso Ramen');
  });

  it('returns null for blank input', () => {
    expect(cleanAlias(' ')).toBeNull();
  });
});

describe('slugify', () => {
  it('strips diacritics and punctuation', () => {
    expect(slugify('Crème Brûlée')).toBe('creme-brulee');
    expect(slugify('Fish & Chips!')).toBe('fish-and-chips');
  });

  it('trims leading and trailing separators', () => {
    expect(slugify('  --Xiao long bao-- ')).toBe('xiao-long-bao');
  });
});
