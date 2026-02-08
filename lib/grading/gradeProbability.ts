export type GradeOutcome = { label: string; probability: number };
export type PsaNormalizationOptions = {
  allowPsa10Override?: boolean;
  maxPsa10Probability?: number;
};

const CONFIDENCE_SHIFT = 0.1;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatGradeNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatPsaLabel(value: number): string {
  if (value <= 7) return "PSA 7 or lower";
  return `PSA ${formatGradeNumber(value)}`;
}

function adjustTowardHalf(value: number, delta: number): number {
  if (value > 0.5) return Math.max(0.5, value - delta);
  if (value < 0.5) return Math.min(0.5, value + delta);
  return value;
}

function adjustAwayFromHalf(value: number, delta: number): number {
  if (value > 0.5) return Math.min(1, value + delta);
  if (value < 0.5) return Math.max(0, value - delta);
  return clamp(0.5 + delta, 0, 1);
}

function applyConfidence(baseLowProbability: number, confidence?: "low" | "medium" | "high"): number {
  if (!confidence || confidence === "medium") return baseLowProbability;
  if (confidence === "low") return adjustTowardHalf(baseLowProbability, CONFIDENCE_SHIFT);
  return adjustAwayFromHalf(baseLowProbability, CONFIDENCE_SHIFT);
}

function collapseOutcomes(outcomes: GradeOutcome[]): GradeOutcome[] {
  const totals = new Map<string, number>();
  outcomes.forEach((outcome) => {
    totals.set(outcome.label, (totals.get(outcome.label) ?? 0) + outcome.probability);
  });
  return Array.from(totals.entries()).map(([label, probability]) => ({
    label,
    probability,
  }));
}

export function normalizeDistribution(outcomes: GradeOutcome[]): GradeOutcome[] {
  const total = outcomes.reduce((sum, outcome) => sum + outcome.probability, 0);
  if (!total) {
    return outcomes.map((outcome) => ({ ...outcome, probability: 0 }));
  }

  const normalized = outcomes.map((outcome) => ({
    ...outcome,
    probability: outcome.probability / total,
  }));

  const rounded = normalized.map((outcome) => ({
    ...outcome,
    probability: Math.round(outcome.probability * 10000) / 10000,
  }));

  const roundedTotal = rounded.reduce((sum, outcome) => sum + outcome.probability, 0);
  const diff = Math.round((1 - roundedTotal) * 10000) / 10000;

  if (Math.abs(diff) > 0) {
    const maxIndex = rounded.reduce((maxIdx, outcome, idx) =>
      outcome.probability > rounded[maxIdx].probability ? idx : maxIdx,
      0
    );
    rounded[maxIndex] = {
      ...rounded[maxIndex],
      probability: clamp(rounded[maxIndex].probability + diff, 0, 1),
    };
  }

  return rounded;
}

function applyPsa10SoftCap(
  outcomes: GradeOutcome[],
  options?: PsaNormalizationOptions
): GradeOutcome[] {
  const maxPsa10Probability = options?.maxPsa10Probability ?? 0.15;
  const allowOverride = options?.allowPsa10Override ?? false;

  if (allowOverride) return outcomes;

  const psa10Index = outcomes.findIndex((outcome) =>
    outcome.label.toUpperCase().includes("PSA 10")
  );
  if (psa10Index === -1) return outcomes;

  const psa10Probability = outcomes[psa10Index].probability;
  if (psa10Probability <= maxPsa10Probability) return outcomes;

  const excess = psa10Probability - maxPsa10Probability;
  const adjusted = outcomes.map((outcome) => ({ ...outcome }));
  adjusted[psa10Index].probability = maxPsa10Probability;

  const othersTotal = adjusted.reduce(
    (sum, outcome, index) =>
      index === psa10Index ? sum : sum + outcome.probability,
    0
  );

  if (othersTotal > 0) {
    return adjusted.map((outcome, index) => {
      if (index === psa10Index) return outcome;
      const share = outcome.probability / othersTotal;
      return { ...outcome, probability: outcome.probability + excess * share };
    });
  }

  const fallbackIndex = adjusted.findIndex((outcome, index) => index !== psa10Index);
  if (fallbackIndex >= 0) {
    adjusted[fallbackIndex].probability += excess;
  }

  return adjusted;
}

export function normalizePsaDistribution(
  outcomes: GradeOutcome[],
  options?: PsaNormalizationOptions
): GradeOutcome[] {
  // Soft PSA 10 cap (default 15%) unless explicitly overridden for high-confidence, top-tier evidence.
  const capped = applyPsa10SoftCap(outcomes, options);
  return normalizeDistribution(capped);
}

function baseLowProbability(low: number, high: number): number {
  if (low === 8 && high === 9) return 0.35;
  if (low === 9 && high === 10) return 0.7;
  return 0.5;
}

/**
 * Deterministic PSA-style range mapping.
 * - 8-9: medium 0.35 to 8, 0.65 to 9; low flattens to 0.45/0.55; high sharpens to 0.25/0.75.
 * - 9-10: medium 0.70 to 9, 0.30 to 10; low flattens to 0.60/0.40; high sharpens to 0.80/0.20.
 * - Single 10: cap at 0.60 (remaining 0.40 to 9).
 * - Single grades (non-10): 0.70 to the grade, 0.30 to the next lower bucket,
 *   with confidence adjustments applied in the same deterministic way.
 */
export function distributionFromRange(
  rangeLabel: string,
  confidence?: "low" | "medium" | "high"
): GradeOutcome[] {
  const normalized = rangeLabel.trim();
  if (!normalized) return [];

  const matches = normalized.match(/\d+(?:\.\d+)?/g) ?? [];
  const values = matches.map((value) => Number(value)).filter((value) => Number.isFinite(value));
  if (values.length === 0) return [];

  const hasOrLower = /or\s+lower/i.test(normalized);
  let low = values[0];
  let high = values[1] ?? values[0];

  if (values.length >= 2) {
    low = Math.min(values[0], values[1]);
    high = Math.max(values[0], values[1]);
  }

  if (hasOrLower && values.length === 1) {
    return normalizeDistribution([{ label: formatPsaLabel(low), probability: 1 }]);
  }

  if (low === high) {
    if (high >= 10) {
      return normalizeDistribution([
        { label: "PSA 10", probability: 0.6 },
        { label: "PSA 9", probability: 0.4 },
      ]);
    }
    const baseLow = applyConfidence(0.3, confidence);
    const outcomes = collapseOutcomes([
      { label: formatPsaLabel(high - 1), probability: baseLow },
      { label: formatPsaLabel(high), probability: 1 - baseLow },
    ]);
    return normalizeDistribution(outcomes);
  }

  const base = baseLowProbability(low, high);
  const adjustedLow = applyConfidence(base, confidence);
  const outcomes = collapseOutcomes([
    { label: formatPsaLabel(low), probability: adjustedLow },
    { label: formatPsaLabel(high), probability: 1 - adjustedLow },
  ]);

  return normalizeDistribution(outcomes);
}
