# CoreBench

Full-stack benchmark harness, throughput profiler, and latency regression suite for the CoreBlow Gateway.

## Overview

CoreBench is part of the CoreBlow public repository family. It provides automated benchmarking tools to measure CoreBlow Gateway performance, response latency percentiles (p50/p95/p99), concurrency scaling, error rates, and composite quality scores across versions.

This repository follows the same ecosystem split that CoreBlow uses to keep release surfaces small, auditable, and independently governed.

## Repository Role

- Status: Active
- Phase: 3
- Priority: quality
- Kind: benchmark
- Family: CoreBlow public repository family
- Branding: CoreBlow

## Features

- **Concurrent Turn Runner**: Asynchronous worker pool executing configurable turn workloads against live Gateway endpoints.
- **Percentile Tracking**: Sub-millisecond high-resolution timing measuring min, avg, p50, p95, p99, and max response latencies.
- **Composite Scoring**: Balanced evaluation of correctness (1 - error rate), reliability, and response latency.
- **Multi-Format Output**: Human-readable console summaries, structured JSON for CI automation, and formatted Markdown tables.

## Usage

### Command Line Interface

```sh
# Benchmark local gateway with 50 turns and concurrency 5
node bin/corebench.mjs --endpoint http://127.0.0.1:18789/health --turns 50 --concurrency 5

# Output structured JSON report
node bin/corebench.mjs --endpoint http://127.0.0.1:18789/health --json

# Generate Markdown table for PR comments or releases
node bin/corebench.mjs --endpoint http://127.0.0.1:18789/health --markdown

# Run streaming TTFT & RTT profiler (consolidated from coreblow-rtt)
node bin/corebench.mjs rtt --url http://127.0.0.1:18789/api/chat/stream --samples 5 --markdown
node bin/coreblow-rtt.mjs --url http://127.0.0.1:18789/api/chat/stream --samples 5 --json

# Compare baseline vs current JSON report with regression threshold (exits non-zero on regression)
node bin/corebench.mjs compare --baseline baseline.json --current current.json --max-regression-pct 15

# Run behavioral agent evaluation suite (40 scenarios across 4 categories)
node bin/corebench.mjs eval --self-check --json
node bin/corebench.mjs eval --target http://127.0.0.1:18789/api/eval --min-pass-rate 80 --json
```

### Programmatic Usage

```js
import { runBenchmark, formatMarkdownReport } from "@coreblow/corebench";

const report = await runBenchmark({
  endpoint: "http://127.0.0.1:18789/health",
  concurrency: 4,
  turns: 20,
});

console.log(`p95 Latency: ${report.latency.p95Ms}ms | Score: ${report.compositeScore}`);
```

### Running Tests

```sh
npm test
```

## Release Policy

Do not publish packages, tags, installers, or release artifacts from this repository without explicit CoreBlow release approval.

Version changes must follow the coordinated CoreBlow release plan.

## Links

- [CoreBlow](https://github.com/coreblow/coreblow)
- [Documentation](https://docs.coreblow.com)
- [Website](https://coreblow.com)
- [Security Policy](SECURITY.md)
- [Contributing](CONTRIBUTING.md)
