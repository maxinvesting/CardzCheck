#!/usr/bin/env tsx
/**
 * Summarize CMV Benchmark Results
 *
 * Reads results.csv and generates:
 * - Console summary with key metrics
 * - Markdown report at tmp/benchmarks/summary.md
 */

import * as fs from "fs";
import * as path from "path";

// ============================================================================
// TYPES
// ============================================================================

interface ResultRow {
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
  baseline_status: string;
  cardzcheck_cmv: number | null;
  cmv_status: string;
  abs_error: number | null;
  pct_error: number | null;
  error_bucket: string;
  latency_ms: number;
  error_message: string;
}

// ============================================================================
// CSV PARSER
// ============================================================================

function parseCSV(filePath: string): ResultRow[] {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n").filter((line) => line.trim());

  if (lines.length < 2) {
    console.error("❌ CSV is empty or has no data rows");
    return [];
  }

  const header = lines[0];
  const dataLines = lines.slice(1);

  const rows: ResultRow[] = [];

  for (const line of dataLines) {
    // Simple CSV parsing (handles quoted fields)
    const fields: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++; // Skip escaped quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === "," && !inQuotes) {
        fields.push(current);
        current = "";
      } else {
        current += char;
      }
    }
    fields.push(current); // Push last field

    if (fields.length < 18) continue; // Skip malformed rows

    const row: ResultRow = {
      case_id: fields[0],
      sport: fields[1],
      player: fields[2],
      set: fields[3],
      parallel: fields[4] || null,
      grade: fields[5] || null,
      query_string: fields[6],
      ebay_baseline_median: fields[7] ? parseFloat(fields[7]) : null,
      ebay_baseline_trimmed_mean: fields[8] ? parseFloat(fields[8]) : null,
      ebay_sample_size: parseInt(fields[9], 10) || 0,
      baseline_status: fields[10],
      cardzcheck_cmv: fields[11] ? parseFloat(fields[11]) : null,
      cmv_status: fields[12],
      abs_error: fields[13] ? parseFloat(fields[13]) : null,
      pct_error: fields[14] ? parseFloat(fields[14]) : null,
      error_bucket: fields[15],
      latency_ms: parseInt(fields[16], 10) || 0,
      error_message: fields[17] || "",
    };

    rows.push(row);
  }

  return rows;
}

// ============================================================================
// STATS COMPUTATION
// ============================================================================

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

interface Summary {
  total: number;
  completed: number;
  insufficient_comps: number;
  errors: number;
  latencies: number[];
  pct_errors: number[];
  within_10: number;
  within_20: number;
  within_30: number;
  over_30: number;
  by_sport: Record<string, { count: number; mean_pct_error: number }>;
  by_set: Record<string, { count: number; mean_pct_error: number }>;
  worst_outliers: ResultRow[];
}

function computeSummary(rows: ResultRow[]): Summary {
  const summary: Summary = {
    total: rows.length,
    completed: 0,
    insufficient_comps: 0,
    errors: 0,
    latencies: [],
    pct_errors: [],
    within_10: 0,
    within_20: 0,
    within_30: 0,
    over_30: 0,
    by_sport: {},
    by_set: {},
    worst_outliers: [],
  };

  const sportErrors: Record<string, number[]> = {};
  const setErrors: Record<string, number[]> = {};

  for (const row of rows) {
    summary.latencies.push(row.latency_ms);

    if (row.baseline_status === "ok" && row.cmv_status === "ok") {
      summary.completed++;
      if (row.pct_error !== null) {
        summary.pct_errors.push(row.pct_error);

        // Bucket
        if (row.error_bucket === "within_10%") summary.within_10++;
        else if (row.error_bucket === "within_20%") summary.within_20++;
        else if (row.error_bucket === "within_30%") summary.within_30++;
        else if (row.error_bucket === ">30%") summary.over_30++;

        // By sport
        if (!summary.by_sport[row.sport]) {
          summary.by_sport[row.sport] = { count: 0, mean_pct_error: 0 };
          sportErrors[row.sport] = [];
        }
        summary.by_sport[row.sport].count++;
        sportErrors[row.sport].push(row.pct_error);

        // By set
        if (!summary.by_set[row.set]) {
          summary.by_set[row.set] = { count: 0, mean_pct_error: 0 };
          setErrors[row.set] = [];
        }
        summary.by_set[row.set].count++;
        setErrors[row.set].push(row.pct_error);
      }
    } else if (row.baseline_status === "insufficient_comps" || row.cmv_status === "insufficient_comps") {
      summary.insufficient_comps++;
    } else {
      summary.errors++;
    }
  }

  // Compute means
  for (const sport in sportErrors) {
    summary.by_sport[sport].mean_pct_error = mean(sportErrors[sport]);
  }
  for (const set in setErrors) {
    summary.by_set[set].mean_pct_error = mean(setErrors[set]);
  }

  // Find worst outliers
  const withErrors = rows.filter((r) => r.pct_error !== null).sort((a, b) => (b.pct_error || 0) - (a.pct_error || 0));
  summary.worst_outliers = withErrors.slice(0, 20);

  return summary;
}

// ============================================================================
// REPORT GENERATION
// ============================================================================

function generateMarkdownReport(summary: Summary): string {
  const lines: string[] = [];

  lines.push("# CMV Benchmark Summary");
  lines.push("");
  lines.push(`**Generated:** ${new Date().toISOString()}`);
  lines.push("");

  // Overall Stats
  lines.push("## Overall Statistics");
  lines.push("");
  lines.push(`- **Total cases:** ${summary.total}`);
  lines.push(`- **Completed (ok):** ${summary.completed}`);
  lines.push(`- **Insufficient comps:** ${summary.insufficient_comps}`);
  lines.push(`- **Errors:** ${summary.errors}`);
  lines.push("");

  // Latency
  if (summary.latencies.length > 0) {
    const avgLatency = mean(summary.latencies);
    const p95Latency = percentile(summary.latencies, 95);
    lines.push("## Performance");
    lines.push("");
    lines.push(`- **Avg latency:** ${Math.round(avgLatency)} ms`);
    lines.push(`- **P95 latency:** ${Math.round(p95Latency)} ms`);
    lines.push("");
  }

  // Accuracy
  if (summary.pct_errors.length > 0) {
    const meanPctError = mean(summary.pct_errors);
    const medianPctError = median(summary.pct_errors);
    lines.push("## Accuracy");
    lines.push("");
    lines.push(`- **Mean % error:** ${meanPctError.toFixed(2)}%`);
    lines.push(`- **Median % error:** ${medianPctError.toFixed(2)}%`);
    lines.push("");
    lines.push("### Error Buckets");
    lines.push("");
    lines.push(`| Bucket | Count | Percentage |`);
    lines.push(`|--------|-------|------------|`);
    lines.push(`| Within 10% | ${summary.within_10} | ${((summary.within_10 / summary.completed) * 100).toFixed(1)}% |`);
    lines.push(`| Within 20% | ${summary.within_20} | ${((summary.within_20 / summary.completed) * 100).toFixed(1)}% |`);
    lines.push(`| Within 30% | ${summary.within_30} | ${((summary.within_30 / summary.completed) * 100).toFixed(1)}% |`);
    lines.push(`| Over 30% | ${summary.over_30} | ${((summary.over_30 / summary.completed) * 100).toFixed(1)}% |`);
    lines.push("");
  }

  // By Sport
  if (Object.keys(summary.by_sport).length > 0) {
    lines.push("## Breakdown by Sport");
    lines.push("");
    lines.push(`| Sport | Cases | Mean % Error |`);
    lines.push(`|-------|-------|--------------|`);
    for (const [sport, stats] of Object.entries(summary.by_sport).sort((a, b) => b[1].count - a[1].count)) {
      lines.push(`| ${sport} | ${stats.count} | ${stats.mean_pct_error.toFixed(2)}% |`);
    }
    lines.push("");
  }

  // By Set (top 20)
  if (Object.keys(summary.by_set).length > 0) {
    lines.push("## Breakdown by Set (Top 20)");
    lines.push("");
    lines.push(`| Set | Cases | Mean % Error |`);
    lines.push(`|-----|-------|--------------|`);
    const topSets = Object.entries(summary.by_set)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 20);
    for (const [set, stats] of topSets) {
      lines.push(`| ${set} | ${stats.count} | ${stats.mean_pct_error.toFixed(2)}% |`);
    }
    lines.push("");
  }

  // Worst Outliers
  if (summary.worst_outliers.length > 0) {
    lines.push("## Worst 20 Outliers");
    lines.push("");
    lines.push(`| Player | Set | Grade | eBay Median | CC CMV | % Error | Sample Size |`);
    lines.push(`|--------|-----|-------|-------------|--------|---------|-------------|`);
    for (const row of summary.worst_outliers) {
      lines.push(
        `| ${row.player} | ${row.set} | ${row.grade || "raw"} | $${row.ebay_baseline_median?.toFixed(2) || "N/A"} | $${
          row.cardzcheck_cmv?.toFixed(2) || "N/A"
        } | ${row.pct_error?.toFixed(1)}% | ${row.ebay_sample_size} |`
      );
    }
    lines.push("");
  }

  lines.push("---");
  lines.push("");
  lines.push("**Note:** This benchmark uses eBay SOLD comps as the baseline. CardzCheck CMV is computed using the same SOLD data (no Browse API fallback).");

  return lines.join("\n");
}

function printConsoleSummary(summary: Summary): void {
  console.log("\n" + "=".repeat(80));
  console.log("CMV BENCHMARK SUMMARY");
  console.log("=".repeat(80));
  console.log("");

  console.log("📊 Overall Statistics:");
  console.log(`   Total cases:         ${summary.total}`);
  console.log(`   Completed (ok):      ${summary.completed}`);
  console.log(`   Insufficient comps:  ${summary.insufficient_comps}`);
  console.log(`   Errors:              ${summary.errors}`);
  console.log("");

  if (summary.latencies.length > 0) {
    const avgLatency = mean(summary.latencies);
    const p95Latency = percentile(summary.latencies, 95);
    console.log("⚡ Performance:");
    console.log(`   Avg latency:   ${Math.round(avgLatency)} ms`);
    console.log(`   P95 latency:   ${Math.round(p95Latency)} ms`);
    console.log("");
  }

  if (summary.pct_errors.length > 0) {
    const meanPctError = mean(summary.pct_errors);
    const medianPctError = median(summary.pct_errors);
    console.log("🎯 Accuracy:");
    console.log(`   Mean % error:   ${meanPctError.toFixed(2)}%`);
    console.log(`   Median % error: ${medianPctError.toFixed(2)}%`);
    console.log("");
    console.log("   Error Buckets:");
    console.log(`     Within 10%: ${summary.within_10} (${((summary.within_10 / summary.completed) * 100).toFixed(1)}%)`);
    console.log(`     Within 20%: ${summary.within_20} (${((summary.within_20 / summary.completed) * 100).toFixed(1)}%)`);
    console.log(`     Within 30%: ${summary.within_30} (${((summary.within_30 / summary.completed) * 100).toFixed(1)}%)`);
    console.log(`     Over 30%:   ${summary.over_30} (${((summary.over_30 / summary.completed) * 100).toFixed(1)}%)`);
    console.log("");
  }

  if (Object.keys(summary.by_sport).length > 0) {
    console.log("🏅 By Sport:");
    for (const [sport, stats] of Object.entries(summary.by_sport).sort((a, b) => b[1].count - a[1].count)) {
      console.log(`   ${sport.padEnd(15)} ${String(stats.count).padStart(4)} cases, ${stats.mean_pct_error.toFixed(2)}% mean error`);
    }
    console.log("");
  }

  if (summary.worst_outliers.length > 0) {
    console.log("⚠️  Worst 5 Outliers:");
    for (const row of summary.worst_outliers.slice(0, 5)) {
      console.log(`   ${row.player} (${row.set}, ${row.grade || "raw"})`);
      console.log(`     eBay: $${row.ebay_baseline_median?.toFixed(2)}, CC: $${row.cardzcheck_cmv?.toFixed(2)}, Error: ${row.pct_error?.toFixed(1)}%, Samples: ${row.ebay_sample_size}`);
    }
    console.log("");
  }

  console.log("=".repeat(80));
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const resultsPath = path.join(process.cwd(), "tmp", "benchmarks", "results.csv");
  const summaryPath = path.join(process.cwd(), "tmp", "benchmarks", "summary.md");

  if (!fs.existsSync(resultsPath)) {
    console.error(`❌ Results file not found: ${resultsPath}`);
    console.error("   Run the benchmark first: npm run bench:cmv:sold");
    process.exit(1);
  }

  console.log("📖 Reading results...");
  const rows = parseCSV(resultsPath);

  if (rows.length === 0) {
    console.error("❌ No valid data rows found in results.csv");
    process.exit(1);
  }

  console.log(`✓  Parsed ${rows.length} result rows`);

  const summary = computeSummary(rows);

  printConsoleSummary(summary);

  const markdown = generateMarkdownReport(summary);
  fs.writeFileSync(summaryPath, markdown, "utf-8");

  console.log(`\n✅ Summary report written to: ${summaryPath}\n`);
}

main().catch((error) => {
  console.error("❌ Summary generation failed:", error);
  process.exit(1);
});
