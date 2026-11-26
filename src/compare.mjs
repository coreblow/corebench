function round(value) {
  return Math.round(value * 100) / 100;
}

function compareLatencyMetric(name, baselineMs, currentMs, maxRegressionPct, metrics, regressions) {
  if (typeof baselineMs !== "number" || typeof currentMs !== "number") return;
  const deltaMs = round(currentMs - baselineMs);
  const deltaPct = baselineMs > 0 ? round(((currentMs - baselineMs) / baselineMs) * 100) : currentMs > 0 ? 100 : 0;
  metrics[name] = { baselineMs, currentMs, deltaMs, deltaPct };
  if (deltaPct > maxRegressionPct) {
    regressions.push({
      metric: name,
      baseline: baselineMs,
      current: currentMs,
      deltaPct,
      thresholdPct: maxRegressionPct,
      reason: `${name} regressed by ${deltaPct}% (threshold ${maxRegressionPct}%)`,
    });
  }
}

export function compareReports(baseline, current, options = {}) {
  const maxRegressionPct = Number.isFinite(options.maxRegressionPct) ? options.maxRegressionPct : 15;
  const maxScoreDrop = Number.isFinite(options.maxScoreDrop) ? options.maxScoreDrop : 0.05;

  const metrics = {};
  const regressions = [];

  if (baseline?.latency && current?.latency) {
    compareLatencyMetric("latency.p50Ms", baseline.latency.p50Ms, current.latency.p50Ms, maxRegressionPct, metrics, regressions);
    compareLatencyMetric("latency.p95Ms", baseline.latency.p95Ms, current.latency.p95Ms, maxRegressionPct, metrics, regressions);
    compareLatencyMetric("latency.p99Ms", baseline.latency.p99Ms, current.latency.p99Ms, maxRegressionPct, metrics, regressions);
    compareLatencyMetric("latency.avgMs", baseline.latency.avgMs, current.latency.avgMs, maxRegressionPct, metrics, regressions);
  }

  if (baseline?.rtt && current?.rtt) {
    compareLatencyMetric("rtt.medianMs", baseline.rtt.medianMs, current.rtt.medianMs, maxRegressionPct, metrics, regressions);
    compareLatencyMetric("rtt.p95Ms", baseline.rtt.p95Ms, current.rtt.p95Ms, maxRegressionPct, metrics, regressions);
    compareLatencyMetric("rtt.avgMs", baseline.rtt.avgMs, current.rtt.avgMs, maxRegressionPct, metrics, regressions);
  }

  if (baseline?.ttft && current?.ttft) {
    compareLatencyMetric("ttft.medianMs", baseline.ttft.medianMs, current.ttft.medianMs, maxRegressionPct, metrics, regressions);
    compareLatencyMetric("ttft.p95Ms", baseline.ttft.p95Ms, current.ttft.p95Ms, maxRegressionPct, metrics, regressions);
  }

  if (typeof baseline?.compositeScore === "number" && typeof current?.compositeScore === "number") {
    const scoreDrop = round(baseline.compositeScore - current.compositeScore);
    metrics.compositeScore = {
      baseline: baseline.compositeScore,
      current: current.compositeScore,
      delta: round(current.compositeScore - baseline.compositeScore),
    };
    if (scoreDrop > maxScoreDrop) {
      regressions.push({
        metric: "compositeScore",
        baseline: baseline.compositeScore,
        current: current.compositeScore,
        delta: -scoreDrop,
        thresholdDrop: maxScoreDrop,
        reason: `compositeScore dropped by ${scoreDrop} (threshold ${maxScoreDrop})`,
      });
    }
  }

  if (typeof baseline?.errorRate === "number" && typeof current?.errorRate === "number") {
    const errorDelta = round(current.errorRate - baseline.errorRate);
    metrics.errorRate = { baseline: baseline.errorRate, current: current.errorRate, delta: errorDelta };
    if (errorDelta > 0.01) {
      regressions.push({
        metric: "errorRate",
        baseline: baseline.errorRate,
        current: current.errorRate,
        delta: errorDelta,
        reason: `errorRate increased by ${errorDelta}`,
      });
    }
  }

  return {
    ok: regressions.length === 0,
    maxRegressionPct,
    maxScoreDrop,
    metrics,
    regressions,
  };
}
