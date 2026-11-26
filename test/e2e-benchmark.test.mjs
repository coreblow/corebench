import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const corebenchBin = path.resolve("bin/corebench.mjs");
const rttBin = path.resolve("bin/coreblow-rtt.mjs");

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, status: "ok" }));
    return;
  }
  if (req.url === "/api/chat/stream" && req.method === "POST") {
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.write("data: {\"delta\":\"chunk1 \"}\n\n");
    setTimeout(() => {
      res.write("data: {\"delta\":\"chunk2\"}\n\n");
      res.end();
    }, 8);
    return;
  }
  res.writeHead(404);
  res.end("not found");
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const baseUrl = `http://127.0.0.1:${server.address().port}`;
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "corebench-e2e-"));

try {
  // 1. bin/corebench.mjs run --json
  const benchRes = await execFileAsync(process.execPath, [
    corebenchBin,
    "--endpoint",
    `${baseUrl}/health`,
    "--turns",
    "12",
    "--concurrency",
    "3",
    "--json",
  ]);
  const benchJson = JSON.parse(benchRes.stdout);
  assert.equal(benchJson.totalTurns, 12);
  assert.equal(benchJson.successfulRequests, 12);
  assert.equal(typeof benchJson.latency.p50Ms, "number");
  assert.equal(typeof benchJson.latency.p95Ms, "number");
  assert.equal(typeof benchJson.latency.p99Ms, "number");
  assert.equal(typeof benchJson.compositeScore, "number");

  // 2. bin/corebench.mjs rtt --json
  const rttRes = await execFileAsync(process.execPath, [
    corebenchBin,
    "rtt",
    "--url",
    `${baseUrl}/api/chat/stream`,
    "--samples",
    "4",
    "--json",
  ]);
  const rttJson = JSON.parse(rttRes.stdout);
  assert.equal(rttJson.totalSamples, 4);
  assert.equal(rttJson.successfulSamples, 4);
  assert.equal(typeof rttJson.ttft.medianMs, "number");
  assert.equal(typeof rttJson.rtt.p95Ms, "number");
  assert.equal(typeof rttJson.rtt.avgMs, "number");

  // 3. bin/coreblow-rtt.mjs --json
  const standaloneRtt = await execFileAsync(process.execPath, [
    rttBin,
    "--url",
    `${baseUrl}/api/chat/stream`,
    "--samples",
    "3",
    "--json",
  ]);
  const standaloneJson = JSON.parse(standaloneRtt.stdout);
  assert.equal(standaloneJson.successfulSamples, 3);

  // 4. compare: pass within threshold, fail on regression
  const baselinePath = path.join(tmpDir, "baseline.json");
  const okCurrentPath = path.join(tmpDir, "current-ok.json");
  const badCurrentPath = path.join(tmpDir, "current-regressed.json");

  const baselineReport = {
    latency: { avgMs: 10, p50Ms: 10, p95Ms: 15, p99Ms: 20 },
    compositeScore: 0.98,
    errorRate: 0,
  };
  const okReport = {
    latency: { avgMs: 10.5, p50Ms: 10.5, p95Ms: 16, p99Ms: 21 },
    compositeScore: 0.97,
    errorRate: 0,
  };
  const regressedReport = {
    latency: { avgMs: 25, p50Ms: 24, p95Ms: 40, p99Ms: 55 },
    compositeScore: 0.80,
    errorRate: 0,
  };

  fs.writeFileSync(baselinePath, JSON.stringify(baselineReport), "utf8");
  fs.writeFileSync(okCurrentPath, JSON.stringify(okReport), "utf8");
  fs.writeFileSync(badCurrentPath, JSON.stringify(regressedReport), "utf8");

  const passCompare = await execFileAsync(process.execPath, [
    corebenchBin,
    "compare",
    "--baseline",
    baselinePath,
    "--current",
    okCurrentPath,
    "--max-regression-pct",
    "15",
  ]);
  const passJson = JSON.parse(passCompare.stdout);
  assert.equal(passJson.ok, true);
  assert.equal(passJson.regressions.length, 0);

  let failCompareErr = null;
  try {
    await execFileAsync(process.execPath, [
      corebenchBin,
      "compare",
      "--baseline",
      baselinePath,
      "--current",
      badCurrentPath,
      "--max-regression-pct",
      "15",
    ]);
  } catch (err) {
    failCompareErr = err;
  }
  assert.ok(failCompareErr, "Expected compare to exit non-zero on regression");
  assert.equal(failCompareErr.code, 1);
  const failJson = JSON.parse(failCompareErr.stdout);
  assert.equal(failJson.ok, false);
  assert.ok(failJson.regressions.length > 0);
  console.log("✅ All CoreBench E2E loopback & regression comparator tests passed.");
} finally {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
