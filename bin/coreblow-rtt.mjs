#!/usr/bin/env node

import { formatRttMarkdownReport, profileStreamingSession } from "../src/profiler.mjs";

const args = process.argv.slice(2);

function getArg(flag, fallback) {
  const idx = args.indexOf(flag);
  if (idx !== -1 && idx + 1 < args.length) return args[idx + 1];
  return fallback;
}

const url = getArg("--url", process.env.COREBLOW_STREAM_URL || "http://127.0.0.1:18789/api/chat/stream");
const token = getArg("--token", process.env.COREBLOW_TOKEN || "");
const samples = parseInt(getArg("--samples", "5"), 10);
const isJson = args.includes("--json");
const isMarkdown = args.includes("--markdown");

console.log(`Profiling CoreBlow Streaming TTFT & RTT against ${url} (${samples} samples)...`);

const report = await profileStreamingSession({
  url,
  token,
  sampleCount: samples,
});

if (isJson) {
  console.log(JSON.stringify(report, null, 2));
} else if (isMarkdown) {
  console.log(formatRttMarkdownReport(report));
} else {
  console.log("\n=== CoreBlow RTT Profile Summary ===");
  console.log(`Samples: ${report.successfulSamples}/${report.totalSamples} successful`);
  console.log(`TTFT (Time-To-First-Token): min=${report.ttft.minMs}ms | median=${report.ttft.medianMs}ms | p95=${report.ttft.p95Ms}ms | max=${report.ttft.maxMs}ms`);
  console.log(`RTT  (Round-Trip Time):     min=${report.rtt.minMs}ms | median=${report.rtt.medianMs}ms | p95=${report.rtt.p95Ms}ms | max=${report.rtt.maxMs}ms`);
}
