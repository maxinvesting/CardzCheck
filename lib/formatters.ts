/**
 * Safe numeric formatters that handle null/undefined/NaN gracefully
 * Returns "—" (em dash) for missing or invalid values
 */

export function formatCurrency(value: number | null | undefined): string {
  if (value == null || isNaN(value)) {
    return "—";
  }
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

export function formatPct(value: number | null | undefined): string {
  if (value == null || isNaN(value)) {
    return "—";
  }
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

export function computeGainLoss(
  cmv: number | null | undefined,
  purchasePrice: number | null | undefined
): { amount: number; pct: number } | null {
  // Return null if either value is missing or invalid
  if (
    cmv == null ||
    purchasePrice == null ||
    isNaN(cmv) ||
    isNaN(purchasePrice) ||
    purchasePrice <= 0
  ) {
    return null;
  }

  const amount = cmv - purchasePrice;
  const pct = (amount / purchasePrice) * 100;

  return { amount, pct };
}

/**
 * Format a date string or return fallback
 */
export function formatDate(
  date: string | null | undefined,
  fallback = "—"
): string {
  if (!date) return fallback;

  try {
    return new Date(date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return fallback;
  }
}

/**
 * Format a number with fallback
 */
export function formatNumber(
  value: number | null | undefined,
  fallback = "—"
): string {
  if (value == null || isNaN(value)) {
    return fallback;
  }
  return value.toLocaleString("en-US");
}
