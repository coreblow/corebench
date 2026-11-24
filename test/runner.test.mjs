import assert from "node:assert/strict";
import http from "node:http";
import { formatMarkdownReport, runBenchmark, scoreRun } from "../src/runner.mjs";

console.log("=== Running CoreBench Gateway Benchmark Tests ===");

// 1. Start mock CoreBlow Gateway server
const mockServer = http.createServer((req, res) => {
  if (req.url === "/health") {
    // Simulate ~15ms processing latency
    setTimeout(() => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, status: "ok", version: "2.1.2", uptime: 1000 }));
    }, 15);
  } else if (req.url === "/failing") {
    res.writeHead(503, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "gateway degraded" }));
  } else {
    res.writeHead(404);
    res.end();
  }
});

await new Promise((resolve) => mockServer.listen(0, "127.0.0.1", resolve));
const port = mockServer.address().port;
const endpoint = `http://127.0.0.1:${port}/health`;

try {
  // 2. Run benchmark with 20 turns, concurrency 4
  const report = await runBenchmark({
    endpoint,
    concurrency: 4,
    turns: 20,
    timeoutMs: 2000,
  });

  assert.equal(report.totalTurns, 20);
  assert.equal(report.successfulRequests, 20);
  assert.equal(report.failedRequests, 0);
  assert.equal(report.errorRate, 0);
  assert.ok(report.latency.p50Ms >= 10, "p50 should capture realistic delay");
  assert.ok(report.latency.p95Ms >= report.latency.p50Ms, "p95 >= p50");
  assert.ok(report.latency.p99Ms >= report.latency.p95Ms, "p99 >= p95");
  assert.ok(report.compositeScore > 0.8, "Healthy gateway should achieve high composite score");

  console.log(`✓ Benchmark completed: ${report.successfulRequests}/${report.totalTurns} successful, score: ${report.compositeScore}`);
  console.log(`  Latency: min=${report.latency.minMs}ms, p50=${report.latency.p50Ms}ms, p95=${report.latency.p95Ms}ms, p99=${report.latency.p99Ms}ms`);

  // 3. Test Markdown report formatting
  const md = formatMarkdownReport(report);
  assert.ok(md.includes("# CoreBlow Benchmark Report"));
  assert.ok(md.includes("Composite Score"));
  assert.ok(md.includes("Latency Distribution"));
  console.log("✓ Markdown report generation verified.");

  // 4. Test error handling benchmark
  const failingEndpoint = `http://127.0.0.1:${port}/failing`;
  const failReport = await runBenchmark({
    endpoint: failingEndpoint,
    concurrency: 2,
    turns: 6,
    timeoutMs: 1000,
  });
  assert.equal(failReport.failedRequests, 6);
  assert.equal(failReport.errorRate, 1.0);
  assert.ok(failReport.compositeScore < 0.3, "Failing gateway should receive low score");
  assert.ok(failReport.errors.length > 0);
  console.log("✓ Failing endpoint handling verified (100% error rate captured).");

} finally {
  mockServer.close();
}

console.log("✅ All CoreBench tests passed successfully.\n");
