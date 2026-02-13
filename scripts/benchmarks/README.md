# CMV Benchmark Harness

SOLD-only benchmark that tests CardzCheck's CMV (estimated value) vs eBay SOLD comps at scale (1,000+ cases).

## Features

- **SOLD-only baseline**: Uses only eBay SOLD data (no active listings)
- **Resumable**: Skips already-completed case_ids
- **Cached**: Stores eBay responses to avoid re-hitting API
- **Rate-limit safe**: Configurable concurrency + exponential backoff
- **Comprehensive output**: CSV + JSONL + summary report

## Setup

### 1. Install tsx (if not already installed)

```bash
npm install --save-dev tsx
# or
pnpm add -D tsx
```

### 2. Set Environment Variables

```bash
export EBAY_CLIENT_ID="your_ebay_client_id"
export EBAY_CLIENT_SECRET="your_ebay_client_secret"
```

Optional:
```bash
export BENCH_CONCURRENCY=1  # default: 1, max: 3
```

## Usage

### 1. Generate Test Cases (1000+)

```bash
npm run bench:generate-cases
```

This creates `scripts/benchmarks/cases_1000.json` with 1000+ diverse, realistic test cases emphasizing non-mainstream sets.

### 2. Run the Benchmark

```bash
# Sequential (safest, default)
npm run bench:cmv:sold

# With concurrency (faster, but higher rate limit risk)
BENCH_CONCURRENCY=2 npm run bench:cmv:sold
```

This will:
- Read test cases from `cases_1000.json`
- For each case:
  1. Build query string (reusing CardzCheck's query builder)
  2. Fetch eBay SOLD comps (cached)
  3. Compute eBay baseline (median + trimmed mean)
  4. Compute CardzCheck CMV (SOLD-only mode)
  5. Compare and compute error metrics
- Output results to:
  - `tmp/benchmarks/results.csv`
  - `tmp/benchmarks/results.jsonl`

### 3. Generate Summary Report

```bash
npm run bench:cmv:summary
```

This reads `results.csv` and outputs:
- Console summary with key metrics
- `tmp/benchmarks/summary.md` with detailed breakdown

## Output Files

All output files are in `tmp/benchmarks/` (gitignored):

- **`results.csv`**: One row per case with all metrics
- **`results.jsonl`**: JSON Lines format with full details + raw eBay items
- **`summary.md`**: Markdown report with:
  - Overall stats (completed, insufficient comps, errors)
  - Performance (avg latency, P95)
  - Accuracy (mean/median % error, error buckets)
  - Breakdown by sport and set
  - Worst 20 outliers
- **`cache/ebay_sold/`**: Cached eBay SOLD responses (one file per unique query hash)

## Resumability

The benchmark is fully resumable. If interrupted:

```bash
# Just run again — it will skip completed cases
npm run bench:cmv:sold
```

Completed case_ids are tracked in `results.csv`.

## Cache Management

Cached eBay responses are stored indefinitely in `tmp/benchmarks/cache/ebay_sold/`.

To clear cache and re-fetch:

```bash
rm -rf tmp/benchmarks/cache/
```

## Metrics

For each test case, the benchmark computes:

- **eBay baseline**: Median + trimmed mean (10% trim) of last 20 sold comps (min 8)
- **CardzCheck CMV**: Computed using same SOLD data (no Browse API fallback)
- **abs_error**: `|cc_cmv - ebay_median|`
- **pct_error**: `abs_error / ebay_median * 100`
- **error_bucket**: `within_10%`, `within_20%`, `within_30%`, `>30%`

## Test Cases

The generated 1000+ cases emphasize diversity:

- **Sports**: Football (40%), Basketball (30%), Baseball (25%), Soccer (4%), Hockey (3%)
- **Sets**: Heavy emphasis on non-mainstream sets (Mosaic, Phoenix, Illusions, XR, Origins, Absolute, Chronicles, Elite, Luminance, Prestige, Certified, Spectra, Court Kings, Revolution, Obsidian, Noir, Finest, Heritage, Archives, Stadium Club, Bowman Chrome, etc.)
- **Players**: Mix of rookies (60%), stars (25%), mid-tier (15%)
- **Grades**: 60% raw, 40% graded (PSA 10/9, BGS 9.5/9, PSA 8)
- **Edge cases**: 5% "expected insufficient comps" cases (obscure players/sets)

## Troubleshooting

### Missing tsx

```bash
npm install --save-dev tsx
```

### eBay Rate Limits

If you hit rate limits:
1. Wait 5-10 minutes
2. Resume with `npm run bench:cmv:sold`
3. Lower concurrency: `BENCH_CONCURRENCY=1 npm run bench:cmv:sold`

### Bot Detection

If eBay blocks the scraper:
1. The benchmark will cache the error and continue
2. Blocked cases will be marked as `baseline_status=error`
3. You can manually retry later after clearing cache

## Notes

- The benchmark uses the same eBay scraper as production CardzCheck
- CMV computation is SOLD-only for benchmarking (no Browse API fallback)
- Cached responses are shared between eBay baseline and CardzCheck CMV computation
- All files are gitignored except the scripts themselves
