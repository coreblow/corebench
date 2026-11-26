import { performance } from "node:perf_hooks";

// Backward-compatible helpers
export function normalizeSample(sample) {
  return {
    release: String(sample?.release ?? "").trim(),
    region: String(sample?.region ?? "local").trim() || "local",
    milliseconds: Math.max(0, Number(sample?.milliseconds ?? 0)),
  };
}

export function summarizeSamples(samples) {
  const normalized = (samples || []).map(normalizeSample);
  const total = normalized.reduce((sum, sample) => sum + sample.milliseconds, 0);
  return {
    count: normalized.length,
    averageMilliseconds:
      normalized.length === 0 ? 0 : Math.round((total / normalized.length) * 100) / 100,
  };
}

// Real HTTP/SSE TTFT and RTT Network Profiler
export async function profileStreamingSession(options = {}) {
  const {
    url = "http://127.0.0.1:18789/api/chat/stream",
    token = "",
    sampleCount = 5,
    timeoutMs = 10000,
    body = { prompt: "CoreBlow RTT profile probe" },
  } = options;

  const samples = [];
  const count = Math.max(1, sampleCount);

  for (let i = 0; i < count; i++) {
    const t0 = performance.now();
    let ttft = null;
    let rtt = null;
    let chunks = 0;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const headers = {
        Accept: "text/event-stream, application/json, text/plain",
      };
      if (token) headers.Authorization = `Bearer ${token}`;
      if (body) headers["Content-Type"] = "application/json";

      const res = await fetch(url, {
        method: "POST",
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} from ${url}`);
      }

      if (!res.body) {
        throw new Error("Response body is null (no stream)");
      }

      const reader = res.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        chunks++;
        if (ttft === null && value && value.length > 0) {
          ttft = performance.now() - t0;
        }
      }

      rtt = performance.now() - t0;
      if (ttft === null) ttft = rtt;

      samples.push({
        iteration: i + 1,
        ttftMs: Math.round(ttft * 100) / 100,
        rttMs: Math.round(rtt * 100) / 100,
        chunks,
        success: true,
      });
    } catch (err) {
      const duration = performance.now() - t0;
      samples.push({
        iteration: i + 1,
        ttftMs: null,
        rttMs: Math.round(duration * 100) / 100,
        chunks,
        success: false,
        error: err.name === "AbortError" ? "Timeout" : err.message,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  const validTTFT = samples
    .filter((s) => s.success && s.ttftMs !== null)
    .map((s) => s.ttftMs)
    .sort((a, b) => a - b);
  const validRTT = samples
    .filter((s) => s.success && s.rttMs !== null)
    .map((s) => s.rttMs)
    .sort((a, b) => a - b);

  return {
    url,
    totalSamples: count,
    successfulSamples: validRTT.length,
    failedSamples: count - validRTT.length,
    ttft: calculateDistribution(validTTFT),
    rtt: calculateDistribution(validRTT),
    samples,
    timestamp: new Date().toISOString(),
  };
}

function calculateDistribution(sorted) {
  if (sorted.length === 0) {
    return { minMs: 0, medianMs: 0, p95Ms: 0, maxMs: 0, avgMs: 0 };
  }
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const avg = sorted.reduce((a, b) => a + b, 0) / sorted.length;
  const median = getPercentile(sorted, 50);
  const p95 = getPercentile(sorted, 95);

  return {
    minMs: Math.round(min * 10) / 10,
    medianMs: Math.round(median * 10) / 10,
    p95Ms: Math.round(p95 * 10) / 10,
    maxMs: Math.round(max * 10) / 10,
    avgMs: Math.round(avg * 10) / 10,
  };
}

function getPercentile(sorted, pct) {
  if (sorted.length === 0) return 0;
  const index = Math.ceil((pct / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, index))];
}

export function formatRttMarkdownReport(report) {
  return [
    `# CoreBlow Streaming TTFT & RTT Network Profile`,
    ``,
    `- **Target URL**: \`${report.url}\``,
    `- **Samples**: ${report.successfulSamples} / ${report.totalSamples} successful`,
    `- **Timestamp**: ${report.timestamp}`,
    ``,
    `## Latency Distribution Summary`,
    ``,
    `| Metric | Time-To-First-Token (TTFT) | Round-Trip Time (RTT) |`,
    `| :--- | :--- | :--- |`,
    `| Min | ${report.ttft.minMs} ms | ${report.rtt.minMs} ms |`,
    `| **Median** | **${report.ttft.medianMs} ms** | **${report.rtt.medianMs} ms** |`,
    `| **p95** | **${report.ttft.p95Ms} ms** | **${report.rtt.p95Ms} ms** |`,
    `| Max | ${report.ttft.maxMs} ms | ${report.rtt.maxMs} ms |`,
    `| Average | ${report.ttft.avgMs} ms | ${report.rtt.avgMs} ms |`,
  ].join("\n");
}
