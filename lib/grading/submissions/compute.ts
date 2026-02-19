import {
  type GradeEstimatorCardInput,
  fetchGradeCmv,
} from "@/lib/grade-estimator/value";
import type {
  EstimatedValueByGradeCents,
  GradingSubmissionItemRecord,
  GradingSubmissionRecord,
  PsaDistribution,
  SubmissionComparisonRow,
  SubmissionItemComputed,
  SubmissionSummary,
} from "@/lib/grading/submissions/types";

export const DEFAULT_PSA_DISTRIBUTION: PsaDistribution = {
  "10": 0.08,
  "9": 0.34,
  "8": 0.36,
  "7_or_lower": 0.22,
};

const DISTRIBUTION_KEYS: Array<keyof PsaDistribution> = ["10", "9", "8", "7_or_lower"];

const GRADE_LABELS: Record<keyof PsaDistribution, string> = {
  "10": "PSA 10",
  "9": "PSA 9",
  "8": "PSA 8",
  "7_or_lower": "PSA 7 or lower",
};

function sanitizeProbability(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return 0;
  return value;
}

export function normalizePsaDistribution(input?: Partial<PsaDistribution> | null): PsaDistribution {
  const base: PsaDistribution = {
    "10": sanitizeProbability(input?.["10"]),
    "9": sanitizeProbability(input?.["9"]),
    "8": sanitizeProbability(input?.["8"]),
    "7_or_lower": sanitizeProbability(input?.["7_or_lower"]),
  };

  const total = DISTRIBUTION_KEYS.reduce((sum, key) => sum + base[key], 0);
  if (total <= 0) {
    return { ...DEFAULT_PSA_DISTRIBUTION };
  }

  const normalized: PsaDistribution = {
    "10": base["10"] / total,
    "9": base["9"] / total,
    "8": base["8"] / total,
    "7_or_lower": base["7_or_lower"] / total,
  };

  const rounded: PsaDistribution = {
    "10": Math.round(normalized["10"] * 1000000) / 1000000,
    "9": Math.round(normalized["9"] * 1000000) / 1000000,
    "8": Math.round(normalized["8"] * 1000000) / 1000000,
    "7_or_lower": Math.round(normalized["7_or_lower"] * 1000000) / 1000000,
  };

  const roundedTotal = DISTRIBUTION_KEYS.reduce((sum, key) => sum + rounded[key], 0);
  const diff = Math.round((1 - roundedTotal) * 1000000) / 1000000;
  if (diff !== 0) {
    const largestKey = DISTRIBUTION_KEYS.reduce((largest, key) =>
      rounded[key] > rounded[largest] ? key : largest
    );
    rounded[largestKey] = Math.max(0, Math.min(1, rounded[largestKey] + diff));
  }

  return rounded;
}

function dollarsToCents(price: number | null): number | null {
  if (typeof price !== "number" || !Number.isFinite(price)) return null;
  return Math.round(price * 100);
}

export async function fetchEstimatedValueByGradeCents(
  card: GradeEstimatorCardInput
): Promise<{ values: EstimatedValueByGradeCents; hasUnavailable: boolean }> {
  const [psa10, psa9, psa8, raw] = await Promise.all([
    fetchGradeCmv(card, "psa10"),
    fetchGradeCmv(card, "psa9"),
    fetchGradeCmv(card, "psa8"),
    fetchGradeCmv(card, "raw"),
  ]);

  const values: EstimatedValueByGradeCents = {
    "10": dollarsToCents(psa10.price),
    "9": dollarsToCents(psa9.price),
    "8": dollarsToCents(psa8.price),
    "7_or_lower": dollarsToCents(raw.price),
  };

  const hasUnavailable = DISTRIBUTION_KEYS.some((key) => values[key] === null);
  return { values, hasUnavailable };
}

export function computeExpectedValueCents(
  distribution: PsaDistribution,
  valuesByGrade: EstimatedValueByGradeCents
): number {
  const total = DISTRIBUTION_KEYS.reduce((sum, key) => {
    const cents = valuesByGrade[key] ?? 0;
    return sum + distribution[key] * cents;
  }, 0);
  return Math.round(total);
}

export function computeBreakEvenGrade(
  thresholdCents: number,
  valuesByGrade: EstimatedValueByGradeCents
): string | null {
  const ordered: Array<keyof PsaDistribution> = ["10", "9", "8", "7_or_lower"];
  for (const key of ordered) {
    const value = valuesByGrade[key];
    if (typeof value === "number" && value >= thresholdCents) {
      return GRADE_LABELS[key];
    }
  }
  return null;
}

export function computeProbabilityBelowThreshold(
  thresholdCents: number,
  distribution: PsaDistribution,
  valuesByGrade: EstimatedValueByGradeCents
): number | null {
  const breakEvenKnown = DISTRIBUTION_KEYS.some((key) => {
    const value = valuesByGrade[key];
    return typeof value === "number";
  });
  if (!breakEvenKnown) return null;

  const probability = DISTRIBUTION_KEYS.reduce((sum, key) => {
    const value = valuesByGrade[key];
    if (value === null) {
      return sum + distribution[key];
    }
    return value < thresholdCents ? sum + distribution[key] : sum;
  }, 0);

  return Math.max(0, Math.min(1, Math.round(probability * 1000000) / 1000000));
}

function getSubmissionCostPerCardCents(
  submission: GradingSubmissionRecord,
  totalCards: number
): number {
  if (totalCards <= 0) return 0;
  const totalCosts =
    submission.shipping_cents +
    submission.insurance_cents +
    (submission.fees_actual_cents ?? submission.fees_estimate_cents);
  return Math.round(totalCosts / totalCards);
}

export function computeSubmissionItemMetrics(
  submission: GradingSubmissionRecord,
  items: GradingSubmissionItemRecord[]
): SubmissionItemComputed[] {
  const totalCards = items.reduce((sum, item) => sum + Math.max(1, item.quantity || 1), 0);
  const perCardShare = getSubmissionCostPerCardCents(submission, totalCards);

  return items.map((item) => {
    const distribution = normalizePsaDistribution(item.predicted_distribution);
    const threshold = (item.cost_basis_cents ?? 0) + perCardShare;
    const breakEven = computeBreakEvenGrade(threshold, item.estimated_value_by_grade);
    const belowBreakEvenProbability = computeProbabilityBelowThreshold(
      threshold,
      distribution,
      item.estimated_value_by_grade
    );
    return {
      id: item.id,
      expected_profit_cents: item.expected_value_cents - threshold,
      below_break_even_probability: belowBreakEvenProbability,
      break_even_grade: breakEven,
    };
  });
}

export function buildSubmissionSummary(
  submission: GradingSubmissionRecord,
  items: GradingSubmissionItemRecord[]
): SubmissionSummary {
  const computed = computeSubmissionItemMetrics(submission, items);
  const computedById = new Map(computed.map((row) => [row.id, row]));

  const totalCards = items.reduce((sum, item) => sum + Math.max(1, item.quantity || 1), 0);
  const totalEstimatedFees =
    submission.shipping_cents +
    submission.insurance_cents +
    (submission.fees_actual_cents ?? submission.fees_estimate_cents);

  let totalExpectedValue = 0;
  let totalExpectedProfit = 0;
  let likelyNegativeCount = 0;

  for (const item of items) {
    const quantity = Math.max(1, item.quantity || 1);
    totalExpectedValue += item.expected_value_cents * quantity;

    const row = computedById.get(item.id);
    const expectedProfit = row?.expected_profit_cents ?? 0;
    totalExpectedProfit += expectedProfit * quantity;

    if ((row?.below_break_even_probability ?? 0) >= 0.5) {
      likelyNegativeCount += 1;
    }
  }

  const downsidePercent =
    items.length > 0
      ? Math.round((likelyNegativeCount / items.length) * 10000) / 100
      : 0;

  return {
    total_cards: totalCards,
    total_estimated_fees_cents: totalEstimatedFees,
    total_expected_value_cents: totalExpectedValue,
    total_expected_profit_cents: totalExpectedProfit,
    downside_percent: downsidePercent,
  };
}

export function getMostLikelyPredictedGrade(
  distribution: PsaDistribution
): { grade: string | null; probability: number | null } {
  let top: { key: keyof PsaDistribution; probability: number } | null = null;
  for (const key of DISTRIBUTION_KEYS) {
    const probability = distribution[key];
    if (!top || probability > top.probability) {
      top = { key, probability };
    }
  }

  if (!top) {
    return { grade: null, probability: null };
  }

  return {
    grade: GRADE_LABELS[top.key],
    probability: Math.round(top.probability * 1000000) / 1000000,
  };
}

export function buildSubmissionComparisonRows(
  items: GradingSubmissionItemRecord[]
): SubmissionComparisonRow[] {
  return items
    .filter((item) => Boolean(item.actual_grade))
    .map((item) => {
      const normalized = normalizePsaDistribution(item.predicted_distribution);
      const predicted = getMostLikelyPredictedGrade(normalized);
      return {
        item_id: item.id,
        title: item.title,
        predicted_most_likely_grade: predicted.grade,
        predicted_probability: predicted.probability,
        actual_grade: item.actual_grade,
      };
    });
}
