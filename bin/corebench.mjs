#!/usr/bin/env node

import { formatMarkdownReport, runBenchmark } from "../src/runner.mjs";

const args = process.argv.slice(2);

function getArg(flag, fallback) {
  const idx = args.indexOf(flag);
  if (idx !== -1 && idx + 1 < args.length) return args[idx + 1];
  return fallback;
}

const endpoint = getArg("--endpoint", process.env.COREBLOW_GATEWAY_URL || "http://127.0.0.1:18789/health");
const token = getArg("--token", process.env.COREBLOW_TOKEN || "");
const concurrency = parseInt(getArg("--concurrency", "4"), 10);
const turns = parseInt(getArg("--turns", "20"), 10);
const isJson = args.includes("--json");
const isMarkdown = args.includes("--markdown");

console.log(`Running CoreBlow benchmark against ${endpoint} (turns: ${turns}, concurrency: ${concurrency})...`);

const report = await runBenchmark({
  endpoint,
  token,
  concurrency,
  turns,
});

if (isJson) {
  console.log(JSON.stringify(report, null, 2));
} else if (isMarkdown) {
  console.log(formatMarkdownReport(report));
} else {
  console.log("\n=== Benchmark Summary ===");
  console.log(`Composite Score: ${report.compositeScore} / 1.0`);
  console.log(`Requests: ${report.successfulRequests}/${report.totalTurns} (${report.rps} req/s)`);
  console.log(`Latency: p50=${report.latency.p50Ms}ms | p95=${report.latency.p95Ms}ms | p99=${report.latency.p99Ms}ms`);
  console.log(`Error Rate: ${(report.errorRate * 100).toFixed(1)}%`);
}
