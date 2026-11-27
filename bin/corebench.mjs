#!/usr/bin/env node

import fs from "node:fs";
import { compareReports } from "../src/compare.mjs";
import { formatEvalMarkdownReport, runEvalSuite } from "../src/eval.mjs";
import { formatMarkdownReport, runBenchmark } from "../src/runner.mjs";
import { formatRttMarkdownReport, profileStreamingSession } from "../src/profiler.mjs";

const rawArgs = process.argv.slice(2);
const SUBCOMMANDS = ["rtt", "compare", "run", "eval"];
const subcommand = SUBCOMMANDS.includes(rawArgs[0]) ? rawArgs[0] : "run";
const args = SUBCOMMANDS.includes(rawArgs[0]) ? rawArgs.slice(1) : rawArgs;

function getArg(flag, fallback) {
  const idx = args.indexOf(flag);
  if (idx !== -1 && idx + 1 < args.length) return args[idx + 1];
  return fallback;
}

const isJson = args.includes("--json");
const isMarkdown = args.includes("--markdown");

if (subcommand === "eval") {
  const suitePath = getArg("--suite", "");
  const targetUrl = getArg("--target", "");
  const responsesPath = getArg("--responses", "");
  const selfCheck = args.includes("--self-check");
  const category = getArg("--category", "");
  const minPassRate = parseFloat(getArg("--min-pass-rate", "80"));
  const token = getArg("--token", process.env.COREBLOW_TOKEN || "");

  const report = await runEvalSuite({
    ...(suitePath ? { suitePath } : {}),
    targetUrl,
    responsesPath,
    selfCheck,
    category,
    minPassRate,
    token,
  });

  if (isJson) {
    console.log(JSON.stringify(report, null, 2));
  } else if (isMarkdown) {
    console.log(formatEvalMarkdownReport(report));
  } else {
    console.log("\n=== CoreBench Behavioral Eval Summary ===");
    console.log(`Suite: ${report.suite} (mode: ${report.mode})`);
    console.log(`Overall: ${report.overall.passed}/${report.overall.total} (${report.overall.passRate}%) | Threshold: ${report.minPassRate}% | ${report.ok ? "PASS" : "FAIL"}`);
    for (const [cat, stats] of Object.entries(report.categories)) {
      console.log(`  - ${cat}: ${stats.passed}/${stats.total} (${stats.passRate}%)`);
    }
    console.log(`Latency: p50=${report.latency.p50Ms}ms | p95=${report.latency.p95Ms}ms | max=${report.latency.maxMs}ms`);
  }
  process.exit(report.ok ? 0 : 1);
} else if (subcommand === "compare") {
  const baselinePath = getArg("--baseline", "");
  const currentPath = getArg("--current", "");
  if (!baselinePath || !currentPath) {
    console.error("compare requires --baseline <file> and --current <file>");
    process.exit(1);
  }
  const maxRegressionPct = parseFloat(getArg("--max-regression-pct", "15"));
  const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
  const current = JSON.parse(fs.readFileSync(currentPath, "utf8"));
  const result = compareReports(baseline, current, { maxRegressionPct });
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
} else if (subcommand === "rtt") {
  const url = getArg("--url", process.env.COREBLOW_STREAM_URL || "http://127.0.0.1:18789/api/chat/stream");
  const token = getArg("--token", process.env.COREBLOW_TOKEN || "");
  const samples = parseInt(getArg("--samples", "5"), 10);

  if (!isJson) {
    console.log(`Profiling CoreBlow Streaming TTFT & RTT against ${url} (${samples} samples)...`);
  }

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
} else {
  const endpoint = getArg("--endpoint", process.env.COREBLOW_GATEWAY_URL || "http://127.0.0.1:18789/health");
  const token = getArg("--token", process.env.COREBLOW_TOKEN || "");
  const concurrency = parseInt(getArg("--concurrency", "4"), 10);
  const turns = parseInt(getArg("--turns", "20"), 10);

  if (!isJson) {
    console.log(`Running CoreBlow benchmark against ${endpoint} (turns: ${turns}, concurrency: ${concurrency})...`);
  }

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
}
