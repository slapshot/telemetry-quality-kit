import { TelemetryQualityTracker } from '../src/index.js';

const start = Date.parse('2026-01-01T00:00:00Z');
const tracker = new TelemetryQualityTracker({
  from: start,
  to: start + 60_000,
  expectedIntervalMs: 10_000,
  staleAfterMs: 20_000,
  histogram: { min: -20, max: 80, width: 0.5 },
});

for (const [seconds, value, sourceAge] of [
  [0, 21, 0],
  [10, 22, 0],
  [20, 22.5, 0],
  [50, 23, 25],
] as const) {
  const at = start + seconds * 1000;
  tracker.add({ at, value, observedAt: at - sourceAge * 1000 });
}

console.log(JSON.stringify(tracker.snapshot(), null, 2));
