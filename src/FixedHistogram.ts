export interface HistogramOptions {
  min: number;
  max: number;
  width: number;
  /** Prevent accidental huge allocations. Defaults to 10,000 buckets. */
  maxBuckets?: number;
}

export interface HistogramSummary {
  bounds: { min: number; max: number; width: number };
  insideCount: number;
  underflowCount: number;
  overflowCount: number;
  p05: number | null;
  median: number | null;
  p95: number | null;
  /** At most half a bucket for in-range quantile estimates. */
  maxApproximationError: number;
}

/** Fixed-memory approximate quantiles with explicit out-of-range accounting. */
export class FixedHistogram {
  private readonly counts: Float64Array;
  private inside = 0;
  private underflow = 0;
  private overflow = 0;
  readonly min: number;
  readonly max: number;
  readonly width: number;

  constructor(options: HistogramOptions) {
    const { min, max, width, maxBuckets = 10_000 } = options;
    const buckets = Math.ceil((max - min) / width);
    if (
      !Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(width) ||
      !(max > min) || !(width > 0) || !Number.isSafeInteger(maxBuckets) || maxBuckets < 1 ||
      !Number.isSafeInteger(buckets) || buckets < 1 || buckets > maxBuckets
    ) {
      throw new RangeError('Invalid histogram bounds, width, or bucket limit');
    }
    this.min = min;
    this.max = max;
    this.width = width;
    this.counts = new Float64Array(buckets);
  }

  add(value: number): boolean {
    if (!Number.isFinite(value)) return false;
    if (value < this.min) this.underflow += 1;
    else if (value > this.max) this.overflow += 1;
    else {
      const index = Math.min(this.counts.length - 1, Math.floor((value - this.min) / this.width));
      this.counts[index] = this.counts[index]! + 1;
      this.inside += 1;
    }
    return true;
  }

  /** Returns null when the requested rank falls in an out-of-range bucket. */
  quantile(q: number): number | null {
    if (!Number.isFinite(q) || q < 0 || q > 1) throw new RangeError('Quantile must be in [0, 1]');
    const total = this.inside + this.underflow + this.overflow;
    if (total === 0) return null;
    const rank = Math.max(1, Math.ceil(q * total));
    if (rank <= this.underflow || rank > this.underflow + this.inside) return null;
    let cumulative = this.underflow;
    for (let i = 0; i < this.counts.length; i++) {
      cumulative += this.counts[i]!;
      if (cumulative >= rank) {
        const low = this.min + i * this.width;
        return (low + Math.min(this.max, low + this.width)) / 2;
      }
    }
    return null;
  }

  snapshot(): HistogramSummary {
    return {
      bounds: { min: this.min, max: this.max, width: this.width },
      insideCount: this.inside,
      underflowCount: this.underflow,
      overflowCount: this.overflow,
      p05: this.quantile(0.05),
      median: this.quantile(0.5),
      p95: this.quantile(0.95),
      maxApproximationError: this.width / 2,
    };
  }
}
