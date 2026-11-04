# Telemetry Quality Kit

**Small, zero-runtime-dependency TypeScript primitives for evaluating telemetry streams.**

Track missing or invalid numeric readings, sampling gaps, source observation freshness, estimated time coverage, streaming min/max/mean and approximate quantiles. Designed for IoT streams, equipment monitoring, environmental sensors and general time-series ingestion pipelines.

[![CI](https://github.com/slapshot/telemetry-quality-kit/actions/workflows/ci.yml/badge.svg)](https://github.com/slapshot/telemetry-quality-kit/actions/workflows/ci.yml)

> **Status: experimental (0.1.x).** The code is open source under MIT but is **not published to npm**. The package is marked `private` until its public API stabilizes.

## Quick start

```bash
git clone https://github.com/slapshot/telemetry-quality-kit.git
cd telemetry-quality-kit
npm install
npm run check
```

Example (TypeScript, run in your application after building the library):

```ts
import { TelemetryQualityTracker } from '@slapshot/telemetry-quality-kit';

const tracker = new TelemetryQualityTracker({
  from: '2026-01-01T00:00:00Z',
  to: '2026-01-01T00:01:00Z',
  expectedIntervalMs: 10_000,
  staleAfterMs: 20_000,
  histogram: { min: -20, max: 80, width: 0.5 },
});

tracker.add({ at: '2026-01-01T00:00:00Z', value: 21.5, observedAt: '2026-01-01T00:00:00Z' });
tracker.add({ at: '2026-01-01T00:00:30Z', value: 22.1, observedAt: '2026-01-01T00:00:05Z' });

console.log(tracker.snapshot());
// sampling.gapCount === 1, freshness.staleCount === 1
```

The import above illustrates the intended package API, not an available npm package. Today, build this repository and import from `./dist/index.js` or link the local package. No npm registry release has been made.

## APIs

- `RunningStats`: online count, min, max, mean; skips null and non-finite inputs.
- `FixedHistogram`: fixed-width bucket distribution, approximate p05/median/p95, underflow and overflow counts. The returned quantile is `null` if its rank is outside the configured range. Maximum in-range approximation error is half the bucket width.
- `TelemetryQualityTracker`: validates ordered input in a fixed `[from, to)` time window; reports sampling intervals, gaps, stale/missing/future source timestamps and approximate coverage with explicit quality flags.

The tracker works with epoch milliseconds, JavaScript `Date`, or ISO 8601 strings with an explicit `Z` or UTC offset. Samples must be strictly ordered by their `at` timestamp; duplicates, out-of-order samples and out-of-window samples throw, and failed additions do not alter the tracker.

## Coverage is an estimate

The metric `coverage.estimatedCoveredMs` assumes that a **valid numeric sample** represents the signal from its collection time until the earlier of the next sample, `maxHoldMs`, or the end of the analysis window. The unobserved period after a maximum hold is **not** counted as covered. Missing/invalid values do not start a hold. Source staleness is reported independently and does not automatically remove estimated signal coverage.

For example, with a 10 s interval and `maxHoldMs = 10_000`, samples at second 0 and second 30 over a 40 s window contribute 20 seconds of estimated coverage, **not** 40 seconds.

This approximation must not be interpreted as proof the sensor was continuously available or the value stayed physically constant. There is no domain-specific pass/fail or safety score.

## Resource limits

Tracking uses O(1) state with no histogram or O(number of histogram buckets) with one. Histogram allocations are capped at 10,000 buckets by default. The library does not store raw samples, perform network requests, or require an external database.

## Development

Use Node.js **22.12+** (CI runs Node 24), TypeScript and Vitest.

```bash
npm install
npm run typecheck
npm test
npm run build
```

See [`examples/basic.ts`](examples/basic.ts) and [`tests/`](tests/) for more examples. Public repository content is independently written as a generic toolkit: it contains no third-party device integration, deployment detail or private telemetry records.

## Contributing & security

See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md). Licensed under [MIT](LICENSE).
