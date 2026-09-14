import { describe, expect, it } from 'vitest';
import { londonDateString } from './dates';

describe('londonDateString', () => {
  it('uses the London date during British Summer Time', () => {
    // 23:30 UTC on 30 June is 00:30 on 1 July in London
    expect(londonDateString(new Date('2026-06-30T23:30:00Z'))).toBe('2026-07-01');
  });

  it('matches UTC in winter', () => {
    expect(londonDateString(new Date('2026-01-15T23:30:00Z'))).toBe('2026-01-15');
  });

  it('formats as YYYY-MM-DD', () => {
    expect(londonDateString()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
