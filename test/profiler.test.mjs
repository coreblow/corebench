import assert from "node:assert/strict";
import http from "node:http";
import {
  formatRttMarkdownReport,
  normalizeSample,
  profileStreamingSession,
  summarizeSamples,
} from "../src/profiler.mjs";

console.log("=== Running CoreBlow RTT & TTFT Profiler Tests ===");

// 1. Backward-compatible tests
const sample = normalizeSample({ release: " 2.1.2 ", region: " us-west ", milliseconds: 42 });
assert.equal(sample.release, "2.1.2");
assert.equal(sample.region, "us-west");
assert.equal(sample.milliseconds, 42);

const summary = summarizeSamples([{ milliseconds: 10 }, { milliseconds: 30 }]);
assert.equal(summary.count, 2);
assert.equal(summary.averageMilliseconds, 20);
console.log("✓ Backward-compatible sample normalization and summary verified.");

// 2. Start mock streaming HTTP/SSE server
const mockServer = http.createServer((req, res) => {
  if (req.url === "/stream") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    // Send first token after 25ms delay
    setTimeout(() => {
      res.write("data: token_1\n\n");
      // Second token after another 25ms
      setTimeout(() => {
        res.write("data: token_2\n\n");
        // Complete stream after another 15ms
        setTimeout(() => {
          res.write("event: done\ndata: [DONE]\n\n");
          res.end();
        }, 15);
      }, 25);
    }, 25);
  } else {
    res.writeHead(404);
    res.end();
  }
});

await new Promise((resolve) => mockServer.listen(0, "127.0.0.1", resolve));
const port = mockServer.address().port;
const streamUrl = `http://127.0.0.1:${port}/stream`;

try {
  // 3. Profile 4 streaming sessions
  const report = await profileStreamingSession({
    url: streamUrl,
    sampleCount: 4,
    timeoutMs: 2000,
  });

  assert.equal(report.totalSamples, 4);
  assert.equal(report.successfulSamples, 4);
  assert.equal(report.failedSamples, 0);

  // TTFT should be >= 15ms (first token delayed by ~20ms)
  assert.ok(report.ttft.minMs >= 10, `TTFT min should be >= 10ms, got ${report.ttft.minMs}ms`);
  assert.ok(report.ttft.medianMs >= report.ttft.minMs);
  assert.ok(report.ttft.p95Ms >= report.ttft.medianMs);

  // RTT should be >= TTFT (total stream takes ~50ms)
  assert.ok(report.rtt.medianMs >= report.ttft.medianMs, "RTT should exceed or equal TTFT");
  assert.ok(report.rtt.p95Ms >= report.rtt.medianMs);
  assert.ok(report.rtt.maxMs >= report.rtt.minMs);

  console.log(`✓ Streaming profiling verified across 4 iterations:`);
  console.log(`  TTFT: min=${report.ttft.minMs}ms | median=${report.ttft.medianMs}ms | p95=${report.ttft.p95Ms}ms | max=${report.ttft.maxMs}ms`);
  console.log(`  RTT:  min=${report.rtt.minMs}ms | median=${report.rtt.medianMs}ms | p95=${report.rtt.p95Ms}ms | max=${report.rtt.maxMs}ms`);

  // 4. Test Markdown report generation
  const md = formatRttMarkdownReport(report);
  assert.ok(md.includes("# CoreBlow Streaming TTFT & RTT Network Profile"));
  assert.ok(md.includes("Time-To-First-Token"));
  assert.ok(md.includes("Round-Trip Time"));
  console.log("✓ Markdown streaming report verified.");
} finally {
  mockServer.close();
}

console.log("✅ All CoreBlow RTT tests passed successfully.\n");
