import { performance } from "node:perf_hooks";
import { compareReports } from "./compare.mjs";
import { scoreRun } from "./score.mjs";

export { compareReports, scoreRun };

export async function runBenchmark(options = {}) {
  const {
    endpoint = "http://127.0.0.1:18789/health",
    token = "",
    concurrency = 2,
    turns = 10,
    timeoutMs = 5000,
    method = "GET",
    body = null,
  } = options;

  const latencies = [];
  let successfulRequests = 0;
  let failedRequests = 0;
  const errors = [];

  const totalTurns = Math.max(1, turns);
  const activeConcurrency = Math.min(totalTurns, Math.max(1, concurrency));

  const startTime = performance.now();
  let executedTurns = 0;

  async function worker() {
    while (true) {
      const turnIndex = executedTurns++;
      if (turnIndex >= totalTurns) break;

      const t0 = performance.now();
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        const headers = { Accept: "application/json" };
        if (token) headers.Authorization = `Bearer ${token}`;
        if (body) headers["Content-Type"] = "application/json";

        const res = await fetch(endpoint, {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });

        clearTimeout(timer);
        const t1 = performance.now();
        const duration = t1 - t0;
        latencies.push(duration);

        if (res.ok) {
          successfulRequests++;
        } else {
          failedRequests++;
          errors.push(`HTTP ${res.status}`);
        }
      } catch (err) {
        const t1 = performance.now();
        latencies.push(t1 - t0);
        failedRequests++;
        errors.push(err.name === "AbortError" ? "Timeout" : err.message);
      }
    }
  }

  const workers = Array.from({ length: activeConcurrency }, () => worker());
  await Promise.all(workers);

  const totalDurationMs = performance.now() - startTime;
  latencies.sort((a, b) => a - b);

  const errorRate = totalTurns > 0 ? failedRequests / totalTurns : 0;
  const p50 = getPercentile(latencies, 50);
  const p95 = getPercentile(latencies, 95);
  const p99 = getPercentile(latencies, 99);
  const minLatency = latencies.length > 0 ? latencies[0] : 0;
  const maxLatency = latencies.length > 0 ? latencies[latencies.length - 1] : 0;
  const avgLatency = latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;
  const rps = totalDurationMs > 0 ? (totalTurns / (totalDurationMs / 1000)) : 0;

  // Latency score: 1.0 at <= 10ms, decreasing to 0.0 at >= 500ms
  const normalizedLatencyScore = Math.max(0, Math.min(1, 1 - (avgLatency / 500)));
  const compositeScore = scoreRun({
    correctness: 1 - errorRate,
    reliability: errorRate === 0 ? 1 : Math.max(0, 1 - errorRate * 1.5),
    latency: normalizedLatencyScore,
  });

  return {
    endpoint,
    concurrency: activeConcurrency,
    totalTurns,
    successfulRequests,
    failedRequests,
    errorRate: Math.round(errorRate * 1000) / 1000,
    rps: Math.round(rps * 10) / 10,
    totalDurationMs: Math.round(totalDurationMs * 10) / 10,
    latency: {
      minMs: Math.round(minLatency * 10) / 10,
      avgMs: Math.round(avgLatency * 10) / 10,
      p50Ms: Math.round(p50 * 10) / 10,
      p95Ms: Math.round(p95 * 10) / 10,
      p99Ms: Math.round(p99 * 10) / 10,
      maxMs: Math.round(maxLatency * 10) / 10,
    },
    compositeScore,
    errors: errors.slice(0, 5),
    timestamp: new Date().toISOString(),
  };
}

function getPercentile(sorted, pct) {
  if (sorted.length === 0) return 0;
  const index = Math.ceil((pct / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))];
}

export function formatMarkdownReport(report) {
  return [
    `# CoreBlow Benchmark Report`,
    ``,
    `- **Target Endpoint**: \`${report.endpoint}\``,
    `- **Total Turns**: ${report.totalTurns} (${report.concurrency} concurrent workers)`,
    `- **Composite Score**: **${report.compositeScore}** / 1.0`,
    `- **Success Rate**: ${Math.round((1 - report.errorRate) * 100)}% (${report.successfulRequests} / ${report.totalTurns})`,
    `- **Throughput**: ${report.rps} req/sec in ${report.totalDurationMs}ms`,
    ``,
    `## Latency Distribution`,
    ``,
    `| Metric | Latency |`,
    `| :--- | :--- |`,
    `| Min | ${report.latency.minMs} ms |`,
    `| Average | ${report.latency.avgMs} ms |`,
    `| **p50** | **${report.latency.p50Ms} ms** |`,
    `| **p95** | **${report.latency.p95Ms} ms** |`,
    `| **p99** | **${report.latency.p99Ms} ms** |`,
    `| Max | ${report.latency.maxMs} ms |`,
    ``,
    report.errors.length > 0 ? `## Sample Errors\n\n${report.errors.map(e => `- ${e}`).join("\n")}` : ``,
  ].filter(Boolean).join("\n");
}
