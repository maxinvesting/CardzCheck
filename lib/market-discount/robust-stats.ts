export interface RobustStatsResult {
  rawPrices: number[];
  cleanedPrices: number[];
  sortedRaw: number[];
  sortedCleaned: number[];
  rawCount: number;
  cleanedCount: number;
  outliersRemoved: number;
  medianBeforeTrim: number | null;
  medianAfterTrim: number | null;
  q1: number | null;
  q3: number | null;
  iqr: number | null;
  lowerBound: number | null;
  upperBound: number | null;
  p25: number | null;
  p75: number | null;
}

export function toFinitePositiveNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return value;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid] ?? null;
}

export function quantile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return sorted[0] ?? null;
  const clamped = Math.max(0, Math.min(1, p));
  const index = clamped * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const lowerValue = sorted[lower] ?? sorted[sorted.length - 1] ?? 0;
  const upperValue = sorted[upper] ?? sorted[sorted.length - 1] ?? 0;
  if (lower === upper) return lowerValue;
  return lowerValue + (upperValue - lowerValue) * (index - lower);
}

export function robustStats(prices: Array<number | null | undefined>): RobustStatsResult {
  const rawPrices = prices
    .map((value) => toFinitePositiveNumber(value))
    .filter((value): value is number => value !== null);
  const sortedRaw = [...rawPrices].sort((a, b) => a - b);

  if (sortedRaw.length === 0) {
    return {
      rawPrices,
      cleanedPrices: [],
      sortedRaw,
      sortedCleaned: [],
      rawCount: 0,
      cleanedCount: 0,
      outliersRemoved: 0,
      medianBeforeTrim: null,
      medianAfterTrim: null,
      q1: null,
      q3: null,
      iqr: null,
      lowerBound: null,
      upperBound: null,
      p25: null,
      p75: null,
    };
  }

  const q1 = quantile(sortedRaw, 0.25);
  const q3 = quantile(sortedRaw, 0.75);
  const iqr = q1 !== null && q3 !== null ? q3 - q1 : null;

  const lowerBound =
    q1 !== null && iqr !== null ? q1 - 1.5 * iqr : null;
  const upperBound =
    q3 !== null && iqr !== null ? q3 + 1.5 * iqr : null;

  const cleanedPrices =
    lowerBound !== null && upperBound !== null
      ? sortedRaw.filter((price) => price >= lowerBound && price <= upperBound)
      : [...sortedRaw];

  const sortedCleaned =
    cleanedPrices.length > 0 ? [...cleanedPrices].sort((a, b) => a - b) : [...sortedRaw];

  const medianBeforeTrim = median(sortedRaw);
  const medianAfterTrim = median(sortedCleaned);

  return {
    rawPrices,
    cleanedPrices: sortedCleaned,
    sortedRaw,
    sortedCleaned,
    rawCount: sortedRaw.length,
    cleanedCount: sortedCleaned.length,
    outliersRemoved: Math.max(0, sortedRaw.length - sortedCleaned.length),
    medianBeforeTrim,
    medianAfterTrim,
    q1,
    q3,
    iqr,
    lowerBound,
    upperBound,
    p25: quantile(sortedCleaned, 0.25),
    p75: quantile(sortedCleaned, 0.75),
  };
}
