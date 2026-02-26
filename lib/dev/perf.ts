"use client";

const PERF_PREFIX = "[PERF]";
const WARNING_COMMIT_AVERAGE_MS = 100;
const WARNING_COOLDOWN_MS = 5000;
const EVENT_LOOP_SAMPLE_MS = 200;
const EVENT_LOOP_LAG_THRESHOLD_MS = 50;

export type PerfBucketName = "initial-load" | "market-floor" | "button-click";

type BucketStats = {
  startedAt: number;
  commits: number;
  actualDurations: number[];
  baseDurations: number[];
};

type PerfStore = {
  interaction: string;
  actualDurations: number[];
  baseDurations: number[];
  activeBuckets: Record<PerfBucketName, boolean>;
  bucketStats: Partial<Record<PerfBucketName, BucketStats>>;
  clickStarts: Record<string, number>;
  clickLatencies: Record<string, number[]>;
  eventLoopLagSpikes: number[];
  renderedRowCount: number;
  domNodeCount: number;
  lastWarningAt: number;
};

declare global {
  interface Window {
    __cardzPerfStore?: PerfStore;
  }
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(p * sorted.length) - 1)
  );
  return sorted[index] ?? 0;
}

export function isPerfEnabled(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  return (
    params.get("perf") === "1" ||
    window.localStorage.getItem("cardzcheck_perf") === "1"
  );
}

function getStore(): PerfStore | null {
  if (!isPerfEnabled() || typeof window === "undefined") return null;

  if (!window.__cardzPerfStore) {
    window.__cardzPerfStore = {
      interaction: "idle",
      actualDurations: [],
      baseDurations: [],
      activeBuckets: {
        "initial-load": false,
        "market-floor": false,
        "button-click": false,
      },
      bucketStats: {},
      clickStarts: {},
      clickLatencies: {},
      eventLoopLagSpikes: [],
      renderedRowCount: 0,
      domNodeCount: 0,
      lastWarningAt: 0,
    };
  }

  return window.__cardzPerfStore;
}

export function perfLog(
  message: string,
  details?: Record<string, unknown>
): void {
  if (!isPerfEnabled()) return;
  if (details) {
    console.log(`${PERF_PREFIX} ${message}`, details);
    return;
  }
  console.log(`${PERF_PREFIX} ${message}`);
}

export function setPerfInteraction(interaction: string): void {
  const store = getStore();
  if (!store) return;
  store.interaction = interaction;
}

export function activatePerfBucket(name: PerfBucketName): void {
  const store = getStore();
  if (!store) return;
  store.activeBuckets[name] = true;
  store.bucketStats[name] = {
    startedAt: performance.now(),
    commits: 0,
    actualDurations: [],
    baseDurations: [],
  };
  perfLog(`bucket start: ${name}`);
}

export function deactivatePerfBucket(
  name: PerfBucketName,
  details?: Record<string, unknown>
): void {
  const store = getStore();
  if (!store) return;

  const stats = store.bucketStats[name];
  store.activeBuckets[name] = false;

  if (!stats) return;

  perfLog(`bucket end: ${name}`, {
    commits: stats.commits,
    durationMs: round(performance.now() - stats.startedAt),
    avgCommitMs: round(average(stats.actualDurations)),
    p95CommitMs: round(percentile(stats.actualDurations, 0.95)),
    avgBaseMs: round(average(stats.baseDurations)),
    ...details,
  });

  delete store.bucketStats[name];
}

export function recordInventoryCommit(input: {
  phase: "mount" | "update" | "nested-update";
  actualDuration: number;
  baseDuration: number;
  startTime: number;
  commitTime: number;
}): void {
  const store = getStore();
  if (!store) return;

  const actual = round(input.actualDuration);
  const base = round(input.baseDuration);

  store.actualDurations.push(actual);
  store.baseDurations.push(base);

  if (store.actualDurations.length > 500) {
    store.actualDurations.shift();
    store.baseDurations.shift();
  }

  (Object.keys(store.activeBuckets) as PerfBucketName[]).forEach((name) => {
    if (!store.activeBuckets[name]) return;
    const stats = store.bucketStats[name];
    if (!stats) return;
    stats.commits += 1;
    stats.actualDurations.push(actual);
    stats.baseDurations.push(base);
  });

  const activeBuckets = (Object.keys(store.activeBuckets) as PerfBucketName[]).filter(
    (name) => store.activeBuckets[name]
  );

  perfLog("InventoryTable commit", {
    phase: input.phase,
    interaction: store.interaction,
    actualDurationMs: actual,
    baseDurationMs: base,
    startTimeMs: round(input.startTime),
    commitTimeMs: round(input.commitTime),
    activeBuckets,
  });

  const recent = store.actualDurations.slice(-20);
  const recentAvg = average(recent);
  const now = performance.now();
  if (
    recent.length >= 5 &&
    recentAvg > WARNING_COMMIT_AVERAGE_MS &&
    now - store.lastWarningAt > WARNING_COOLDOWN_MS
  ) {
    store.lastWarningAt = now;
    perfLog("warning: average InventoryTable commit over 100ms", {
      avgCommitMs: round(recentAvg),
      sampleSize: recent.length,
    });
  }
}

export function recordDomMetrics(
  renderedRows: number,
  domNodeCount: number,
  details?: Record<string, unknown>
): void {
  const store = getStore();
  if (!store) return;
  store.renderedRowCount = renderedRows;
  store.domNodeCount = domNodeCount;
  perfLog("Inventory DOM", {
    renderedRows,
    domNodeCount,
    ...details,
  });
}

export function markClickStart(
  key: string,
  details?: Record<string, unknown>
): void {
  const store = getStore();
  if (!store) return;
  store.clickStarts[key] = performance.now();
  setPerfInteraction("click");
  perfLog(`click start: ${key}`, details);
}

export function markClickEnd(
  key: string,
  details?: Record<string, unknown>
): number | null {
  const store = getStore();
  if (!store) return null;

  const startedAt = store.clickStarts[key];
  if (typeof startedAt !== "number") return null;

  const latency = round(performance.now() - startedAt);
  delete store.clickStarts[key];
  if (!store.clickLatencies[key]) {
    store.clickLatencies[key] = [];
  }
  store.clickLatencies[key]!.push(latency);
  perfLog(`click latency: ${key}`, {
    latencyMs: latency,
    ...details,
  });
  return latency;
}

export function startEventLoopLagMonitor(): (() => void) | null {
  if (!isPerfEnabled()) return null;

  let expectedAt = performance.now() + EVENT_LOOP_SAMPLE_MS;
  perfLog("event-loop lag monitor started", {
    sampleMs: EVENT_LOOP_SAMPLE_MS,
    thresholdMs: EVENT_LOOP_LAG_THRESHOLD_MS,
  });

  const interval = window.setInterval(() => {
    const now = performance.now();
    const drift = now - expectedAt;
    expectedAt = now + EVENT_LOOP_SAMPLE_MS;
    if (drift <= EVENT_LOOP_LAG_THRESHOLD_MS) return;

    const store = getStore();
    if (!store) return;
    const driftRounded = round(drift);
    store.eventLoopLagSpikes.push(driftRounded);
    if (store.eventLoopLagSpikes.length > 200) {
      store.eventLoopLagSpikes.shift();
    }

    perfLog("event-loop lag", {
      driftMs: driftRounded,
      at: new Date().toISOString(),
    });
  }, EVENT_LOOP_SAMPLE_MS);

  return () => {
    window.clearInterval(interval);
    perfLog("event-loop lag monitor stopped");
  };
}

export function getPerfSnapshot(): {
  commitAvgMs: number;
  commitP50Ms: number;
  commitP95Ms: number;
  commitCount: number;
  domNodeCount: number;
  renderedRows: number;
  clickLatencies: Record<string, number[]>;
  eventLoopLagSpikes: number[];
} | null {
  const store = getStore();
  if (!store) return null;

  return {
    commitAvgMs: round(average(store.actualDurations)),
    commitP50Ms: round(percentile(store.actualDurations, 0.5)),
    commitP95Ms: round(percentile(store.actualDurations, 0.95)),
    commitCount: store.actualDurations.length,
    domNodeCount: store.domNodeCount,
    renderedRows: store.renderedRowCount,
    clickLatencies: { ...store.clickLatencies },
    eventLoopLagSpikes: [...store.eventLoopLagSpikes],
  };
}
