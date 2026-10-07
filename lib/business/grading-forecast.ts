/**
 * Returns forecast for a card out at grading: the user's estimated sale value
 * at each grade vs. what the card cost all-in (cost basis + tax + shipping +
 * fees, where fees already include the grading fee).
 */

/** grade label → estimated value in cents, e.g. { "10": 120000, "9": 40000 } */
export type GradingValueEstimates = Record<string, number>;

const DEFAULT_TIERS = ["10", "9", "8", "7"];
const HALF_GRADE_TIERS = ["10", "9.5", "9", "8.5"];

/** The grades worth estimating for a grading company. */
export function gradeTiersFor(company: string | null | undefined): string[] {
  const c = (company || "").trim().toUpperCase();
  if (c === "BGS" || c === "CGC" || c === "SGC" || c === "TAG") return HALF_GRADE_TIERS;
  return DEFAULT_TIERS;
}

/** Keeps only finite, non-negative cent values; null when nothing usable. */
export function normalizeValueEstimates(value: unknown): GradingValueEstimates | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const out: GradingValueEstimates = {};
  for (const [grade, cents] of Object.entries(value as Record<string, unknown>)) {
    const n = typeof cents === "string" ? Number(cents) : cents;
    if (grade.trim() && typeof n === "number" && Number.isFinite(n) && n >= 0) {
      out[grade.trim()] = Math.round(n);
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

export interface GradingForecastRow {
  grade: string;
  valueCents: number;
  profitCents: number;
  /** Profit / all-in cost; null when cost is 0. */
  roi: number | null;
}

export function allInCostCents(item: {
  cost_basis_total_cents?: number | null;
  tax_cents?: number | null;
  shipping_cents?: number | null;
  fees_paid_cents?: number | null;
}): number {
  return (
    (item.cost_basis_total_cents ?? 0) +
    (item.tax_cents ?? 0) +
    (item.shipping_cents ?? 0) +
    (item.fees_paid_cents ?? 0)
  );
}

/** Forecast rows ordered from the highest grade down. */
export function buildGradingForecast(
  estimates: GradingValueEstimates | null | undefined,
  costCents: number
): GradingForecastRow[] {
  const normalized = normalizeValueEstimates(estimates);
  if (!normalized) return [];
  return Object.entries(normalized)
    .sort(([a], [b]) => (Number(b) || 0) - (Number(a) || 0))
    .map(([grade, valueCents]) => {
      const profitCents = valueCents - costCents;
      return {
        grade,
        valueCents,
        profitCents,
        roi: costCents > 0 ? profitCents / costCents : null,
      };
    });
}

/** Lowest grade whose estimated value covers the all-in cost, if any. */
export function breakEvenGrade(rows: GradingForecastRow[]): string | null {
  const covering = rows.filter((r) => r.profitCents >= 0);
  return covering.length > 0 ? covering[covering.length - 1].grade : null;
}
