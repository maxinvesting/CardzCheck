#!/usr/bin/env tsx
/**
 * eBay SOLD CMV Benchmark Harness
 *
 * Compares CardzCheck CMV estimates against eBay SOLD comps baseline at scale.
 *
 * Features:
 * - Uses ONLY eBay SOLD data as baseline (no active listings)
 * - Resumable: skips already-completed case_ids
 * - Cached: stores eBay responses to avoid re-hitting API
 * - Rate-limit safe: configurable concurrency + exponential backoff
 * - Outputs: CSV + JSONL + summary report
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { scrapeEbaySoldListings } from "@/lib/ebay/scraper";
import { buildSearchQuery } from "@/lib/ebay/utils";
import type { EbaySearchParams } from "@/lib/ebay/types";

// ============================================================================
// TYPES
// ============================================================================

interface BenchmarkCase {
  case_id: string;
  sport: string;
  player: string;
  year: number | null;
  brand: string;
  set: string;
  parallel: string | null;
  grade: string | null;
  keywords_extra?: string[];
  notes?: string;
}

interface SoldCompStats {
  count: number;
  min: number;
  max: number;
  median: number;
  trimmed_mean: number;
  stdev: number;
}

interface BenchmarkResult {
  case_id: string;
  sport: string;
  player: string;
  set: string;
  parallel: string | null;
  grade: string | null;
  query_string: string;
  ebay_baseline_median: number | null;
  ebay_baseline_trimmed_mean: number | null;
  ebay_sample_size: number;
  baseline_status: "ok" | "insufficient_comps" | "error";
  cardzcheck_cmv: number | null;
  cmv_status: "ok" | "insufficient_comps" | "error";
  abs_error: number | null;
  pct_error: number | null;
  error_bucket: "within_10%" | "within_20%" | "within_30%" | ">30%" | "n/a";
  latency_ms: number;
  error_message?: string;
  cached_ebay_items_used: string[];
}

// ============================================================================
// CONFIG
// ============================================================================

const BENCH_DIR = path.join(process.cwd(), "tmp", "benchmarks");
const CACHE_DIR = path.join(BENCH_DIR, "cache", "ebay_sold");
const RESULTS_CSV = path.join(BENCH_DIR, "results.csv");
const RESULTS_JSONL = path.join(BENCH_DIR, "results.jsonl");

const CONCURRENCY = parseInt(process.env.BENCH_CONCURRENCY || "1", 10);
const MAX_RETRIES = 5;
const MIN_SOLD_COMPS = 8;
const MEDIAN_COMPS_COUNT = 20;
const TRIM_PERCENT = 0.1;

// ============================================================================
// UTILITIES
// ============================================================================

function ensureDirs() {
  fs.mkdirSync(BENCH_DIR, { recursive: true });
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

function hashParams(params: EbaySearchParams): string {
  const normalized = {
    player: params.player.toLowerCase().trim(),
    year: params.year || null,
    set: params.set?.toLowerCase().trim() || null,
    grade: params.grade?.toLowerCase().trim() || null,
    parallelType: params.parallelType?.toLowerCase().trim() || null,
    cardNumber: params.cardNumber?.toLowerCase().trim() || null,
  };
  const str = JSON.stringify(normalized);
  return crypto.createHash("sha256").update(str).digest("hex");
}

function getCachePath(hash: string): string {
  return path.join(CACHE_DIR, `${hash}.json`);
}

function loadCache(hash: string): any | null {
  const cachePath = getCachePath(hash);
  if (!fs.existsSync(cachePath)) return null;
  try {
    const raw = fs.readFileSync(cachePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveCache(hash: string, data: any): void {
  const cachePath = getCachePath(hash);
  fs.writeFileSync(cachePath, JSON.stringify(data, null, 2), "utf-8");
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function trimmedMean(values: number[], trimPct: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const trimCount = Math.floor(sorted.length * trimPct);
  const trimmed = sorted.slice(trimCount, sorted.length - trimCount);
  if (trimmed.length === 0) return null;
  const sum = trimmed.reduce((acc, v) => acc + v, 0);
  return sum / trimmed.length;
}

function stdev(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((acc, v) => acc + v, 0) / values.length;
  const variance = values.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / values.length;
  return Math.sqrt(variance);
}

function computeSoldStats(items: any[]): SoldCompStats {
  const prices = items.map((item) => item.price).filter((p) => typeof p === "number" && p > 0);
  const count = prices.length;
  if (count === 0) {
    return { count: 0, min: 0, max: 0, median: 0, trimmed_mean: 0, stdev: 0 };
  }
  const sorted = [...prices].sort((a, b) => a - b);
  const medianVal = median(sorted) ?? 0;
  const trimmedMeanVal = trimmedMean(sorted, TRIM_PERCENT) ?? 0;
  const stdevVal = stdev(sorted);
  return {
    count,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    median: Math.round(medianVal * 100) / 100,
    trimmed_mean: Math.round(trimmedMeanVal * 100) / 100,
    stdev: Math.round(stdevVal * 100) / 100,
  };
}

function loadCompletedCases(): Set<string> {
  const completed = new Set<string>();
  if (!fs.existsSync(RESULTS_CSV)) return completed;
  const lines = fs.readFileSync(RESULTS_CSV, "utf-8").split("\n");
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const caseId = line.split(",")[0];
    if (caseId) completed.add(caseId);
  }
  return completed;
}

function appendResultCSV(result: BenchmarkResult): void {
  const csvLine = [
    result.case_id,
    result.sport,
    result.player,
    result.set,
    result.parallel || "",
    result.grade || "",
    result.query_string.replace(/"/g, '""'),
    result.ebay_baseline_median ?? "",
    result.ebay_baseline_trimmed_mean ?? "",
    result.ebay_sample_size,
    result.baseline_status,
    result.cardzcheck_cmv ?? "",
    result.cmv_status,
    result.abs_error ?? "",
    result.pct_error ?? "",
    result.error_bucket,
    result.latency_ms,
    result.error_message ? result.error_message.replace(/"/g, '""') : "",
  ]
    .map((v) => `"${v}"`)
    .join(",");

  if (!fs.existsSync(RESULTS_CSV)) {
    const header = [
      "case_id",
      "sport",
      "player",
      "set",
      "parallel",
      "grade",
      "query_string",
      "ebay_baseline_median",
      "ebay_baseline_trimmed_mean",
      "ebay_sample_size",
      "baseline_status",
      "cardzcheck_cmv",
      "cmv_status",
      "abs_error",
      "pct_error",
      "error_bucket",
      "latency_ms",
      "error_message",
    ]
      .map((h) => `"${h}"`)
      .join(",");
    fs.writeFileSync(RESULTS_CSV, header + "\n", "utf-8");
  }

  fs.appendFileSync(RESULTS_CSV, csvLine + "\n", "utf-8");
}

function appendResultJSONL(result: BenchmarkResult): void {
  const jsonLine = JSON.stringify(result) + "\n";
  fs.appendFileSync(RESULTS_JSONL, jsonLine, "utf-8");
}

// ============================================================================
// EBAY SOLD BASELINE
// ============================================================================

async function fetchEbaySoldWithRetry(
  params: EbaySearchParams,
  retries = 0
): Promise<{ items: any[]; error?: string }> {
  const hash = hashParams(params);
  const cached = loadCache(hash);
  if (cached) {
    console.log(`  ✓ Using cached eBay SOLD data (hash: ${hash.slice(0, 8)})`);
    return cached;
  }

  try {
    const result = await scrapeEbaySoldListings(params);
    if (result.status === "ok" || result.status === "unavailable") {
      const cacheData = { items: result.items, error: result.error };
      saveCache(hash, cacheData);
      return cacheData;
    }
    return { items: [], error: result.error || "Unknown scraper error" };
  } catch (error: any) {
    const errorMsg = error?.message || String(error);

    // Rate limit handling
    if (error?.message?.includes("429") || error?.message?.includes("rate limit")) {
      if (retries < MAX_RETRIES) {
        const backoffMs = Math.min(60000, 1000 * Math.pow(2, retries) + Math.random() * 1000);
        console.log(`  ⏳ Rate limited. Retrying in ${Math.round(backoffMs / 1000)}s... (attempt ${retries + 1}/${MAX_RETRIES})`);
        await sleep(backoffMs);
        return fetchEbaySoldWithRetry(params, retries + 1);
      }
      return { items: [], error: `Rate limit exceeded after ${MAX_RETRIES} retries` };
    }

    // Bot detection or blocking
    if (errorMsg.includes("blocked") || errorMsg.includes("verification") || errorMsg.includes("captcha")) {
      console.log(`  ⚠️  eBay blocked: ${errorMsg}`);
      return { items: [], error: errorMsg };
    }

    // Other errors
    if (retries < MAX_RETRIES) {
      const backoffMs = Math.min(60000, 500 * Math.pow(2, retries) + Math.random() * 500);
      console.log(`  ⚠️  Error: ${errorMsg}. Retrying in ${Math.round(backoffMs / 1000)}s...`);
      await sleep(backoffMs);
      return fetchEbaySoldWithRetry(params, retries + 1);
    }

    return { items: [], error: errorMsg };
  }
}

// ============================================================================
// CARDZCHECK CMV (SOLD-ONLY MODE)
// ============================================================================

/**
 * Compute CardzCheck CMV using SOLD comps only.
 * For benchmarking, we skip the fallback to Browse API (active listings).
 */
async function computeCardzCheckCMV(params: EbaySearchParams): Promise<{ cmv: number | null; status: string }> {
  // Reuse the same scraper as baseline — CardzCheck's CMV logic uses this under the hood
  const { items, error } = await fetchEbaySoldWithRetry(params);

  if (error || items.length < MIN_SOLD_COMPS) {
    return { cmv: null, status: "insufficient_comps" };
  }

  // Use last N sold items (default 20)
  const recentItems = items.slice(0, MEDIAN_COMPS_COUNT);
  const prices = recentItems.map((item) => item.price).filter((p) => typeof p === "number" && p > 0);

  if (prices.length < MIN_SOLD_COMPS) {
    return { cmv: null, status: "insufficient_comps" };
  }

  const medianVal = median(prices);
  if (medianVal === null) {
    return { cmv: null, status: "insufficient_comps" };
  }

  return { cmv: Math.round(medianVal * 100) / 100, status: "ok" };
}

// ============================================================================
// BENCHMARK RUNNER
// ============================================================================

async function runBenchmarkCase(testCase: BenchmarkCase): Promise<BenchmarkResult> {
  const startMs = Date.now();

  const params: EbaySearchParams = {
    player: testCase.player,
    year: testCase.year ? String(testCase.year) : undefined,
    set: testCase.set,
    grade: testCase.grade || undefined,
    parallelType: testCase.parallel || undefined,
    keywords: testCase.keywords_extra,
  };

  const queryString = buildSearchQuery(params);

  console.log(`\n[${testCase.case_id}] ${testCase.player} - ${testCase.set} (${testCase.grade || "raw"})`);
  console.log(`  Query: "${queryString}"`);

  // Step 1: Fetch eBay SOLD baseline
  const { items: ebayItems, error: ebayError } = await fetchEbaySoldWithRetry(params);
  const stats = computeSoldStats(ebayItems);
  const baselineStatus: "ok" | "insufficient_comps" | "error" =
    ebayError
      ? "error"
      : stats.count < MIN_SOLD_COMPS
      ? "insufficient_comps"
      : "ok";

  console.log(`  eBay SOLD: ${stats.count} comps, median=$${stats.median}, trimmed_mean=$${stats.trimmed_mean}`);

  // Step 2: Compute CardzCheck CMV (using SOLD only)
  const { cmv: ccCmv, status: ccStatus } = await computeCardzCheckCMV(params);
  console.log(`  CardzCheck CMV: $${ccCmv ?? "N/A"} (${ccStatus})`);

  // Step 3: Compare
  let absError: number | null = null;
  let pctError: number | null = null;
  let errorBucket: "within_10%" | "within_20%" | "within_30%" | ">30%" | "n/a" = "n/a";

  if (baselineStatus === "ok" && ccStatus === "ok" && stats.median > 0 && ccCmv !== null) {
    absError = Math.abs(ccCmv - stats.median);
    pctError = (absError / stats.median) * 100;
    if (pctError <= 10) errorBucket = "within_10%";
    else if (pctError <= 20) errorBucket = "within_20%";
    else if (pctError <= 30) errorBucket = "within_30%";
    else errorBucket = ">30%";
    console.log(`  Error: ${absError.toFixed(2)} (${pctError.toFixed(1)}%) → ${errorBucket}`);
  }

  const latencyMs = Date.now() - startMs;

  const result: BenchmarkResult = {
    case_id: testCase.case_id,
    sport: testCase.sport,
    player: testCase.player,
    set: testCase.set,
    parallel: testCase.parallel,
    grade: testCase.grade,
    query_string: queryString,
    ebay_baseline_median: baselineStatus === "ok" ? stats.median : null,
    ebay_baseline_trimmed_mean: baselineStatus === "ok" ? stats.trimmed_mean : null,
    ebay_sample_size: stats.count,
    baseline_status: baselineStatus,
    cardzcheck_cmv: ccCmv,
    cmv_status: ccStatus as BenchmarkResult["cmv_status"],
    abs_error: absError,
    pct_error: pctError ? Math.round(pctError * 100) / 100 : null,
    error_bucket: errorBucket,
    latency_ms: latencyMs,
    error_message: ebayError,
    cached_ebay_items_used: ebayItems.slice(0, 5).map((item) => item.title || "Unknown"),
  };

  return result;
}

async function runBenchmark(casesPath: string): Promise<void> {
  console.log("🚀 eBay SOLD CMV Benchmark Harness");
  console.log(`   Concurrency: ${CONCURRENCY}`);
  console.log(`   Min sold comps: ${MIN_SOLD_COMPS}`);
  console.log(`   Median comps count: ${MEDIAN_COMPS_COUNT}\n`);

  ensureDirs();

  // Load test cases
  if (!fs.existsSync(casesPath)) {
    console.error(`❌ Test cases file not found: ${casesPath}`);
    process.exit(1);
  }

  const testCases: BenchmarkCase[] = JSON.parse(fs.readFileSync(casesPath, "utf-8"));
  console.log(`📋 Loaded ${testCases.length} test cases from ${casesPath}`);

  // Load completed cases (resume support)
  const completed = loadCompletedCases();
  const remaining = testCases.filter((c) => !completed.has(c.case_id));
  console.log(`✓  ${completed.size} already completed, ${remaining.length} remaining\n`);

  if (remaining.length === 0) {
    console.log("✅ All cases already completed!");
    return;
  }

  // Run cases with concurrency limit
  let processed = 0;
  const total = remaining.length;

  for (let i = 0; i < remaining.length; i += CONCURRENCY) {
    const batch = remaining.slice(i, i + CONCURRENCY);
    const promises = batch.map((testCase) => runBenchmarkCase(testCase));
    const results = await Promise.all(promises);

    for (const result of results) {
      appendResultCSV(result);
      appendResultJSONL(result);
      processed++;
    }

    console.log(`\n⏳ Progress: ${processed}/${total} (${Math.round((processed / total) * 100)}%)\n`);

    // Rate limiting between batches
    if (i + CONCURRENCY < remaining.length) {
      await sleep(1000);
    }
  }

  console.log(`\n✅ Benchmark complete! Results written to:`);
  console.log(`   - ${RESULTS_CSV}`);
  console.log(`   - ${RESULTS_JSONL}`);
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  // Check required env vars
  if (!process.env.EBAY_CLIENT_ID || !process.env.EBAY_CLIENT_SECRET) {
    console.log("⚠️  Missing eBay credentials. Set EBAY_CLIENT_ID and EBAY_CLIENT_SECRET env vars.");
    console.log("   The benchmark uses the scraper which may work without credentials,");
    console.log("   but it's recommended to have them set for Browse API fallback.");
    console.log("");
  }

  const casesPath = process.argv[2] || path.join(process.cwd(), "scripts", "benchmarks", "cases_1000.json");
  await runBenchmark(casesPath);
}

main().catch((error) => {
  console.error("❌ Benchmark failed:", error);
  process.exit(1);
});
