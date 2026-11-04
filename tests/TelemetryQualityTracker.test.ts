import { describe, expect, it } from 'vitest';
import { TelemetryQualityTracker } from '../src/index.js';

const base = Date.parse('2026-01-01T00:00:00Z');
const options = { from: base, to: base + 40_000, expectedIntervalMs: 10_000 } as const;

describe('TelemetryQualityTracker', () => {
  it('reports zero samples without inventing coverage', () => {
    const tracker = new TelemetryQualityTracker(options);
    expect(tracker.snapshot()).toMatchObject({
      samples: { total: 0, valid: 0 },
      sampling: { gapCount: 0, maximumGapMs: null },
      coverage: { estimatedCoveredMs: 0, ratio: 0 },
      flags: ['NO_SAMPLES', 'INCOMPLETE_ESTIMATED_COVERAGE'],
    });
  });

  it('detects sampling gaps, stale observations and incomplete hold-based coverage', () => {
    const tracker = new TelemetryQualityTracker({
      ...options,
      staleAfterMs: 20_000,
      histogram: { min: 0, max: 100, width: 1 },
    });
    tracker.add({ at: base, value: 10, observedAt: base });
    tracker.add({ at: base + 30_000, value: 20, observedAt: base + 5_000 });
    const result = tracker.snapshot();
    expect(result.samples).toMatchObject({ total: 2, valid: 2 });
    expect(result.values).toEqual({ count: 2, min: 10, max: 20, mean: 15 });
    expect(result.histogram?.median).toBe(10.5);
    expect(result.sampling).toMatchObject({
      gapCount: 1, maximumGapMs: 30_000,
      intervals: { count: 1, min: 30_000, max: 30_000, mean: 30_000 },
    });
    expect(result.freshness).toMatchObject({ staleCount: 1, missingObservedAtCount: 0 });
    expect(result.coverage).toEqual({ estimatedCoveredMs: 20_000, ratio: 0.5, maxHoldMs: 10_000 });
    expect(result.flags).toContain('SAMPLING_GAPS');
    expect(result.flags).toContain('STALE_SOURCE_OBSERVATIONS');
    expect(result.flags).toContain('INCOMPLETE_ESTIMATED_COVERAGE');
    expect(tracker.snapshot()).toEqual(result); // snapshot is non-mutating
  });

  it('does not count missing/invalid values as new coverage, but records freshness failures', () => {
    const tracker = new TelemetryQualityTracker(options);
    tracker.add({ at: base, value: null });
    tracker.add({ at: base + 10_000, value: NaN, observedAt: base + 11_000 });
    tracker.add({ at: base + 20_000, value: 7, observedAt: base + 19_000 });
    const result = tracker.snapshot();
    expect(result.samples).toMatchObject({ total: 3, valid: 1, missingValues: 1, invalidValues: 1 });
    expect(result.freshness).toMatchObject({ missingObservedAtCount: 1, futureObservedAtCount: 1, staleCount: 0 });
    expect(result.coverage.estimatedCoveredMs).toBe(10_000);
    expect(result.flags).toContain('MISSING_VALUES');
    expect(result.flags).toContain('INVALID_VALUES');
    expect(result.flags).toContain('FUTURE_SOURCE_TIMESTAMPS');
    expect(result.flags).toContain('UNKNOWN_SOURCE_FRESHNESS');
  });

  it('rejects out-of-order, duplicate and out-of-window samples without altering state', () => {
    const tracker = new TelemetryQualityTracker(options);
    tracker.add({ at: base + 10_000, value: 5 });
    const before = tracker.snapshot();
    for (const at of [base + 10_000, base + 5_000, base - 1, base + 40_000]) {
      expect(() => tracker.add({ at, value: 7 })).toThrow(RangeError);
      expect(tracker.snapshot()).toEqual(before);
    }
    expect(() => tracker.add({ at: base + 20_000, value: 5, observedAt: 'not-a-date' })).toThrow(RangeError);
    expect(tracker.snapshot()).toEqual(before);
    tracker.add({ at: base + 20_000, value: 7 });
    expect(tracker.snapshot().samples.total).toBe(2);
  });

  it('requires explicit timezone in ISO 8601 inputs and rejects invalid options', () => {
    expect(() => new TelemetryQualityTracker({ ...options, from: '2026-01-01T00:00:00' })).toThrow(RangeError);
    expect(() => new TelemetryQualityTracker({ ...options, expectedIntervalMs: 0 })).toThrow(RangeError);
    expect(() => new TelemetryQualityTracker({ ...options, from: base + 40_000 })).toThrow(RangeError);
    const tracker = new TelemetryQualityTracker(options);
    expect(() => tracker.add({ at: '2026-01-01T00:00:00', value: 1 })).toThrow(RangeError);
  });

  it('handles fully covered contiguous readings and post-snapshot continuation', () => {
    const tracker = new TelemetryQualityTracker(options);
    tracker.add({ at: base, value: 1, observedAt: base });
    tracker.add({ at: base + 10_000, value: 2, observedAt: base + 10_000 });
    expect(tracker.snapshot().coverage.estimatedCoveredMs).toBe(20_000);
    tracker.add({ at: base + 20_000, value: 3, observedAt: base + 20_000 });
    tracker.add({ at: base + 30_000, value: 4, observedAt: base + 30_000 });
    const result = tracker.snapshot();
    expect(result.coverage).toMatchObject({ estimatedCoveredMs: 40_000, ratio: 1 });
    expect(result.sampling.gapCount).toBe(0);
    expect(result.flags).not.toContain('INCOMPLETE_ESTIMATED_COVERAGE');
  });
});
