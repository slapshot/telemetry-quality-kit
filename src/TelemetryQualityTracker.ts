import { FixedHistogram, type HistogramOptions, type HistogramSummary } from './FixedHistogram.js';
import { RunningStats, type Statistics } from './RunningStats.js';
import { toEpochMs, type Timestamp } from './time.js';

export interface TelemetrySample {
  /** Collection timestamp: milliseconds, Date or zoned ISO 8601. */
  at: Timestamp;
  value: number | null;
  /** When the source originally observed the value, if known. */
  observedAt?: Timestamp | null;
}

export interface TrackerOptions {
  /** Analysis interval [from, to); no samples outside this range. */
  from: Timestamp;
  to: Timestamp;
  expectedIntervalMs: number;
  /** A gap is recorded when delta > threshold. Default: 1.5 × expected interval. */
  gapThresholdMs?: number;
  /** Max duration for which each valid point is assumed to remain available. Default: expected interval. */
  maxHoldMs?: number;
  /** Stale when collection time - observed time exceeds threshold. Default: 3 × expected interval. */
  staleAfterMs?: number;
  histogram?: HistogramOptions;
}

export interface QualitySummary {
  period: { from: string; to: string; durationMs: number };
  samples: {
    total: number;
    valid: number;
    missingValues: number;
    invalidValues: number;
    firstAt: string | null;
    lastAt: string | null;
  };
  values: Statistics;
  histogram: HistogramSummary | null;
  sampling: {
    expectedIntervalMs: number;
    gapThresholdMs: number;
    intervals: Statistics;
    gapCount: number;
    maximumGapMs: number | null;
  };
  freshness: {
    staleAfterMs: number;
    sourceAgeMs: Statistics;
    staleCount: number;
    missingObservedAtCount: number;
    futureObservedAtCount: number;
  };
  coverage: {
    /** Estimated signal-presence, not verified continuous sensor observation. */
    estimatedCoveredMs: number;
    ratio: number;
    maxHoldMs: number;
  };
  flags: string[];
}

function positive(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new RangeError(`${name} must be a positive integer (ms)`);
  return value;
}

/**
 * Online, bounded-memory telemetry quality analysis.
 * Samples must arrive strictly increasing by `at` and inside [from, to).
 * The tracker never persists data or connects to a network.
 */
export class TelemetryQualityTracker {
  private readonly from: number;
  private readonly to: number;
  private readonly expectedIntervalMs: number;
  private readonly gapThresholdMs: number;
  private readonly maxHoldMs: number;
  private readonly staleAfterMs: number;
  private readonly values = new RunningStats();
  private readonly intervals = new RunningStats();
  private readonly ages = new RunningStats();
  private readonly histogram: FixedHistogram | null;
  private total = 0;
  private missingValues = 0;
  private invalidValues = 0;
  private staleCount = 0;
  private missingObservedAtCount = 0;
  private futureObservedAtCount = 0;
  private gapCount = 0;
  private largestGap: number | null = null;
  private firstAt: number | null = null;
  private previous: { at: number; valid: boolean } | null = null;
  private accumulatedCoverageMs = 0;

  constructor(options: TrackerOptions) {
    this.from = toEpochMs(options.from, 'from');
    this.to = toEpochMs(options.to, 'to');
    if (this.to <= this.from) throw new RangeError('to must be later than from');
    this.expectedIntervalMs = positive(options.expectedIntervalMs, 'expectedIntervalMs');
    this.gapThresholdMs = positive(options.gapThresholdMs ?? Math.floor(this.expectedIntervalMs * 1.5), 'gapThresholdMs');
    this.maxHoldMs = positive(options.maxHoldMs ?? this.expectedIntervalMs, 'maxHoldMs');
    this.staleAfterMs = positive(options.staleAfterMs ?? this.expectedIntervalMs * 3, 'staleAfterMs');
    this.histogram = options.histogram ? new FixedHistogram(options.histogram) : null;
  }

  add(sample: TelemetrySample): void {
    const at = toEpochMs(sample.at, 'sample.at');
    if (at < this.from || at >= this.to) throw new RangeError('sample is outside [from, to)');
    if (this.previous && at <= this.previous.at) throw new RangeError('samples must be strictly increasing by at');
    if (sample.value !== null && typeof sample.value !== 'number') {
      throw new TypeError('sample.value must be a number or null');
    }
    // Validate timestamps before mutating state (failed adds must be atomic).
    const observedAt = sample.observedAt == null ? null : toEpochMs(sample.observedAt, 'sample.observedAt');
    const valid = sample.value !== null && Number.isFinite(sample.value);

    if (this.previous) {
      const delta = at - this.previous.at;
      this.intervals.add(delta);
      if (delta > this.gapThresholdMs) this.gapCount += 1;
      this.largestGap = Math.max(this.largestGap ?? 0, delta);
      if (this.previous.valid) this.accumulatedCoverageMs += Math.min(delta, this.maxHoldMs);
    }

    this.firstAt ??= at;
    this.total += 1;
    if (sample.value === null) this.missingValues += 1;
    else if (!valid) this.invalidValues += 1;
    else {
      this.values.add(sample.value);
      this.histogram?.add(sample.value);
    }

    if (observedAt === null) this.missingObservedAtCount += 1;
    else if (observedAt > at) this.futureObservedAtCount += 1;
    else {
      const age = at - observedAt;
      this.ages.add(age);
      if (age > this.staleAfterMs) this.staleCount += 1;
    }
    this.previous = { at, valid };
  }

  /** Non-mutating; repeated snapshots return equal results. */
  snapshot(): QualitySummary {
    let covered = this.accumulatedCoverageMs;
    if (this.previous?.valid) {
      covered += Math.min(this.to - this.previous.at, this.maxHoldMs);
    }
    const durationMs = this.to - this.from;
    const flags: string[] = [];
    if (this.total === 0) flags.push('NO_SAMPLES');
    if (this.missingValues > 0) flags.push('MISSING_VALUES');
    if (this.invalidValues > 0) flags.push('INVALID_VALUES');
    if (this.gapCount > 0) flags.push('SAMPLING_GAPS');
    if (this.missingObservedAtCount > 0) flags.push('UNKNOWN_SOURCE_FRESHNESS');
    if (this.futureObservedAtCount > 0) flags.push('FUTURE_SOURCE_TIMESTAMPS');
    if (this.staleCount > 0) flags.push('STALE_SOURCE_OBSERVATIONS');
    if (covered < durationMs) flags.push('INCOMPLETE_ESTIMATED_COVERAGE');
    return {
      period: {
        from: new Date(this.from).toISOString(),
        to: new Date(this.to).toISOString(),
        durationMs,
      },
      samples: {
        total: this.total,
        valid: this.values.snapshot().count,
        missingValues: this.missingValues,
        invalidValues: this.invalidValues,
        firstAt: this.firstAt === null ? null : new Date(this.firstAt).toISOString(),
        lastAt: this.previous === null ? null : new Date(this.previous.at).toISOString(),
      },
      values: this.values.snapshot(),
      histogram: this.histogram?.snapshot() ?? null,
      sampling: {
        expectedIntervalMs: this.expectedIntervalMs,
        gapThresholdMs: this.gapThresholdMs,
        intervals: this.intervals.snapshot(),
        gapCount: this.gapCount,
        maximumGapMs: this.largestGap,
      },
      freshness: {
        staleAfterMs: this.staleAfterMs,
        sourceAgeMs: this.ages.snapshot(),
        staleCount: this.staleCount,
        missingObservedAtCount: this.missingObservedAtCount,
        futureObservedAtCount: this.futureObservedAtCount,
      },
      coverage: {
        estimatedCoveredMs: covered,
        ratio: covered / durationMs,
        maxHoldMs: this.maxHoldMs,
      },
      flags,
    };
  }
}
