import { describe, expect, it } from 'vitest';
import { FixedHistogram } from '../src/index.js';

describe('FixedHistogram', () => {
  it('does not produce quantiles for empty data', () => {
    const hist = new FixedHistogram({ min: 0, max: 10, width: 1 });
    expect(hist.quantile(0.5)).toBeNull();
    expect(hist.snapshot().insideCount).toBe(0);
  });

  it('accounts for inclusive upper bound and approximate quantiles', () => {
    const hist = new FixedHistogram({ min: 0, max: 10, width: 1 });
    [0, 1, 5, 8, 10].forEach((value) => hist.add(value));
    expect(hist.snapshot()).toMatchObject({
      insideCount: 5,
      underflowCount: 0,
      overflowCount: 0,
      median: 5.5,
      maxApproximationError: 0.5,
    });
    expect(hist.quantile(1)).toBe(9.5);
  });

  it('reports out-of-range counts without fabricating quantiles for outside ranks', () => {
    const hist = new FixedHistogram({ min: 0, max: 10, width: 1 });
    [-2, 3, 8, 12].forEach((value) => hist.add(value));
    expect(hist.snapshot()).toMatchObject({ insideCount: 2, underflowCount: 1, overflowCount: 1 });
    expect(hist.quantile(0)).toBeNull();
    expect(hist.quantile(1)).toBeNull();
    expect(hist.quantile(0.5)).toBe(3.5);
    expect(hist.add(NaN)).toBe(false);
  });

  it('rejects bad bounds, unbounded allocations and invalid quantiles', () => {
    expect(() => new FixedHistogram({ min: 1, max: 1, width: 0.5 })).toThrow(RangeError);
    expect(() => new FixedHistogram({ min: 0, max: 100_000, width: 0.01 })).toThrow(RangeError);
    const hist = new FixedHistogram({ min: 0, max: 10, width: 1 });
    expect(() => hist.quantile(-0.01)).toThrow(RangeError);
    expect(() => hist.quantile(1.01)).toThrow(RangeError);
  });
});
