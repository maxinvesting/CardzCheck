import type { GradeProbabilities, WorthGradingResult } from "@/types";
import { DEFAULT_GRADE_FEES } from "@/lib/grade-estimator/constants";

/**
 * Pure helpers that turn the existing grade-analysis outputs
 * (`WorthGradingResult` + `GradeProbabilities`) into a dealer-facing
 * "is this card worth grading?" projection: net profit, ROI, break-even
 * grade, risk level, and an advisory grader comparison.
 *
 * Nothing here mutates or replaces the underlying grade-estimate logic — it
 * is a presentation-layer model used by the Grade ROI Simulator.
 */

export type GraderKey = "psa" | "bgs" | "sgc";
export type RiskLevel = "Low" | "Medium" | "High";
export type Verdict = "worth" | "marginal" | "skip";

/** Illustrative marketplace selling fee (eBay + payment processing, ~13%). */
export const SELLING_FEE_RATE = 0.13;

/** SGC is not priced by the core value model; estimate its fee here. */
const SGC_FEE = 25;

export interface GraderComparison {
  key: GraderKey;
  label: string;
  /** Projected net profit at this grader after grading cost (model basis). */
  projectedProfit: number;
  cost: number;
  turnaround: string;
  liquidity: string;
  bestUse: string;
  recommended: boolean;
  /** True when this row is an approximation rather than from priced comps. */
  isEstimate: boolean;
}

export interface ProbabilityModel {
  psa10: number;
  psa9: number;
  psa8OrLower: number;
  /** Probability-weighted expected resale value. */
  expectedValue: number;
}

export interface RoiProjection {
  available: boolean;
  /** True when values come from sample/demo data, not real priced comps. */
  isEstimate: boolean;
  recommendedGrader: GraderKey;
  rawValue: number | null;
  psa10Value: number | null;
  psa9Value: number | null;
  expectedValue: number;
  gradingCost: number;
  sellingFees: number;
  netProfit: number;
  roi: number;
  breakEvenGrade: string | null;
  risk: RiskLevel;
  verdict: Verdict;
  headline: string;
  graders: GraderComparison[];
  probability: ProbabilityModel;
  confidence: "high" | "medium" | "low";
}

const GRADER_META: Record<GraderKey, Omit<GraderComparison, "projectedProfit" | "recommended" | "isEstimate" | "key">> = {
  psa: {
    label: "PSA",
    cost: DEFAULT_GRADE_FEES.psa,
    turnaround: "~20 business days",
    liquidity: "Highest",
    bestUse: "Modern stars & vintage — strongest resale and liquidity",
  },
  bgs: {
    label: "BGS",
    cost: DEFAULT_GRADE_FEES.bgs,
    turnaround: "~15–25 days",
    liquidity: "Strong (Black Label premium)",
    bestUse: "High-end modern where subgrades add value",
  },
  sgc: {
    label: "SGC",
    cost: SGC_FEE,
    turnaround: "~10–15 days",
    liquidity: "Strong for vintage",
    bestUse: "Vintage & cost-sensitive bulk submissions",
  },
};

function round(value: number): number {
  return Math.round(value);
}

/**
 * Lowest grade at which the card clears its costs (raw + grading + selling
 * fees on that grade's resale value). Returns a label like "PSA 9" or null
 * when even a PSA 10 does not break even.
 */
function computeBreakEvenGrade(
  rawValue: number,
  gradingCost: number,
  gradeValues: Array<{ label: string; value: number | null }>
): string | null {
  // gradeValues ordered low → high
  for (const band of gradeValues) {
    if (band.value === null) continue;
    const netAtGrade = band.value - band.value * SELLING_FEE_RATE - rawValue - gradingCost;
    if (netAtGrade >= 0) return band.label;
  }
  return null;
}

function deriveRisk(
  netProfit: number,
  probability: ProbabilityModel,
  confidence: "high" | "medium" | "low"
): RiskLevel {
  if (netProfit <= 0) return "High";
  // Probability the card lands at PSA 8 or lower (where upside usually evaporates).
  const downside = probability.psa8OrLower;
  let risk: RiskLevel;
  if (downside < 0.25 && probability.psa10 >= 0.3) risk = "Low";
  else if (downside < 0.5) risk = "Medium";
  else risk = "High";

  if (confidence === "low" && risk === "Low") risk = "Medium";
  return risk;
}

function deriveVerdict(netProfit: number, roi: number, risk: RiskLevel): Verdict {
  if (netProfit <= 5 || roi <= 0.1) return "skip";
  if (risk === "Low" && roi >= 0.4) return "worth";
  if (roi >= 0.2) return "worth";
  return "marginal";
}

function estimateSgcProfit(
  value: WorthGradingResult,
  probabilities: GradeProbabilities
): number {
  const raw = value.raw.price;
  if (raw === null) return 0;
  // SGC 10 tracks ~ PSA 9.5 (between PSA 9 and PSA 10); SGC 9 ~ PSA 9.
  const psa10 = value.psa["10"].price ?? raw;
  const psa9 = value.psa["9"].price ?? raw;
  const sgc10 = (psa10 + psa9) / 2;
  const sgc9 = psa9;
  const dist = probabilities.sgc;
  const ev =
    dist["9.5"] * sgc10 +
    dist["9"] * sgc9 +
    dist["8.5"] * ((psa9 + raw) / 2) +
    dist["8_or_lower"] * raw;
  return ev - raw - SGC_FEE;
}

export function computeRoiProjection(
  value: WorthGradingResult,
  probabilities: GradeProbabilities,
  options: { isEstimate?: boolean } = {}
): RoiProjection {
  const raw = value.raw.price;
  const psaProb = probabilities.psa;
  const probability: ProbabilityModel = {
    psa10: psaProb["10"],
    psa9: psaProb["9"],
    psa8OrLower: psaProb["8"] + psaProb["7_or_lower"],
    expectedValue: value.psa.ev,
  };

  if (raw === null) {
    return {
      available: false,
      isEstimate: Boolean(options.isEstimate),
      recommendedGrader: "psa",
      rawValue: null,
      psa10Value: value.psa["10"].price,
      psa9Value: value.psa["9"].price,
      expectedValue: 0,
      gradingCost: DEFAULT_GRADE_FEES.psa,
      sellingFees: 0,
      netProfit: 0,
      roi: 0,
      breakEvenGrade: null,
      risk: "High",
      verdict: "skip",
      headline: "Not enough raw market data to project profit yet.",
      graders: [],
      probability,
      confidence: value.confidence,
    };
  }

  const sgcProfit = estimateSgcProfit(value, probabilities);

  const profits: Record<GraderKey, number> = {
    psa: value.psa.netGain,
    bgs: value.bgs.netGain,
    sgc: sgcProfit,
  };

  // Recommend the grader with the highest projected profit.
  const recommendedGrader = (Object.keys(profits) as GraderKey[]).reduce((best, key) =>
    profits[key] > profits[best] ? key : best
  , "psa");

  const graders: GraderComparison[] = (Object.keys(GRADER_META) as GraderKey[]).map((key) => ({
    key,
    ...GRADER_META[key],
    projectedProfit: round(profits[key]),
    recommended: key === recommendedGrader,
    isEstimate: key === "sgc" || Boolean(options.isEstimate),
  }));

  // Headline projection is anchored to the recommended grader (PSA/BGS use the
  // model EV; SGC falls back to its estimate).
  const expectedValue =
    recommendedGrader === "bgs" ? value.bgs.ev : recommendedGrader === "psa" ? value.psa.ev : value.psa.ev;
  const gradingCost = GRADER_META[recommendedGrader].cost;
  const sellingFees = expectedValue * SELLING_FEE_RATE;
  const netProfit = expectedValue - raw - gradingCost - sellingFees;
  const roi = raw + gradingCost > 0 ? netProfit / (raw + gradingCost) : 0;

  const breakEvenGrade = computeBreakEvenGrade(raw, gradingCost, [
    { label: "PSA 8", value: value.psa["8"].price },
    { label: "PSA 9", value: value.psa["9"].price },
    { label: "PSA 10", value: value.psa["10"].price },
  ]);

  const risk = deriveRisk(netProfit, probability, value.confidence);
  const verdict = deriveVerdict(netProfit, roi, risk);

  const headline =
    verdict === "worth"
      ? `Worth grading — projected ${netProfit >= 0 ? "+" : "-"}$${Math.abs(round(netProfit))} net at ${GRADER_META[recommendedGrader].label}.`
      : verdict === "marginal"
        ? `Marginal — thin ${Math.round(roi * 100)}% projected ROI. Grade selectively.`
        : `Likely not worth grading — projected return doesn't clear costs.`;

  return {
    available: true,
    isEstimate: Boolean(options.isEstimate),
    recommendedGrader,
    rawValue: round(raw),
    psa10Value: value.psa["10"].price === null ? null : round(value.psa["10"].price),
    psa9Value: value.psa["9"].price === null ? null : round(value.psa["9"].price),
    expectedValue: round(expectedValue),
    gradingCost,
    sellingFees: round(sellingFees),
    netProfit: round(netProfit),
    roi,
    breakEvenGrade,
    risk,
    verdict,
    headline,
    graders,
    probability,
    confidence: value.confidence,
  };
}
