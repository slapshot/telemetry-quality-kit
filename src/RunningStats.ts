export interface Statistics {
  count: number;
  min: number | null;
  max: number | null;
  mean: number | null;
}

/** Constant-memory numeric statistics; ignores non-finite values. */
export class RunningStats {
  private countValue = 0;
  private minValue = Infinity;
  private maxValue = -Infinity;
  private meanValue = 0;

  add(value: number | null | undefined): boolean {
    if (value == null || !Number.isFinite(value)) return false;
    this.countValue += 1;
    this.minValue = Math.min(this.minValue, value);
    this.maxValue = Math.max(this.maxValue, value);
    // Weighted running mean: avoids overflow from summing large finite inputs.
    this.meanValue += value / this.countValue - this.meanValue / this.countValue;
    return true;
  }

  snapshot(): Statistics {
    return {
      count: this.countValue,
      min: this.countValue ? this.minValue : null,
      max: this.countValue ? this.maxValue : null,
      mean: this.countValue ? this.meanValue : null,
    };
  }
}
