import { describe, expect, it } from 'vitest';
import { RunningStats } from '../src/index.js';

describe('RunningStats', () => {
  it('handles an empty stream', () => {
    expect(new RunningStats().snapshot()).toEqual({ count: 0, min: null, max: null, mean: null });
  });

  it('computes count, min, max and running mean without storing raw values', () => {
    const stats = new RunningStats();
    [5, 12, -1, 8].forEach((value) => expect(stats.add(value)).toBe(true));
    expect(stats.snapshot()).toEqual({ count: 4, min: -1, max: 12, mean: 6 });
  });

  it('ignores null, missing and non-finite values', () => {
    const stats = new RunningStats();
    expect(stats.add(null)).toBe(false);
    expect(stats.add(undefined)).toBe(false);
    expect(stats.add(NaN)).toBe(false);
    expect(stats.add(Infinity)).toBe(false);
    stats.add(2);
    expect(stats.snapshot()).toEqual({ count: 1, min: 2, max: 2, mean: 2 });
  });

  it('avoids overflow from a sum of very large finite numbers', () => {
    const stats = new RunningStats();
    stats.add(1e308);
    stats.add(1e308);
    expect(stats.snapshot().mean).toBe(1e308);
  });
});
