import type { GradeEstimate } from "@/types";

export const EBAY_FEE_RATE = 0.13;

export const PSA_TIERS = {
  value: { label: "Value", fee: 32.99, turnaroundBusinessDays: 75 },
  value_plus: { label: "Value Plus", fee: 49.99, turnaroundBusinessDays: 45 },
  regular: { label: "Regular", fee: 79.99, turnaroundBusinessDays: 25 },
  bulk: { label: "Bulk", fee: 25, turnaroundBusinessDays: 0 },
} as const;

export const BGS_TIERS = {
  standard: { label: "Standard", fee: 17, turnaroundBusinessDays: 0 },
} as const;

export type GradingService = "psa" | "bgs";
export type PsaTierKey = keyof typeof PSA_TIERS;
export type BgsTierKey = keyof typeof BGS_TIERS;
export type GradingTierKey = PsaTierKey | BgsTierKey;
export type RiskRating = "LOW" | "MEDIUM" | "HIGH" | "DO_NOT_GRADE";
export type SubmissionVerdict = "SUBMIT" | "BORDERLINE" | "HOLD_RAW";

export interface SubmissionContext {
  setName?: string | null;
  parallel?: string | null;
  cardNumber?: string | null;
  insert?: string | null;
  variation?: string | null;
  notes?: string | null;
}

export function isModernPsaPreferredSet(setName?: string | null): boolean {
  const value = (setName ?? "").toLowerCase();
  return ["prizm", "chrome", "optic", "select", "topps chrome"].some((token) =>
    value.includes(token)
  );
}

function includesAny(haystack: string, needles: string[]): boolean {
  return needles.some((needle) => haystack.includes(needle));
}

export function isNumberedCard(context: SubmissionContext): boolean {
  const joined = [
    context.parallel,
    context.cardNumber,
    context.notes,
    context.insert,
    context.variation,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return /\/\d{1,4}\b/.test(joined) || includesAny(joined, ["numbered", "serial"]);
}

export function isRcAutoCard(context: SubmissionContext): boolean {
  const joined = [
    context.parallel,
    context.cardNumber,
    context.notes,
    context.insert,
    context.variation,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const hasRcSignal = includesAny(joined, [" rc ", "rookie", "rpa"]);
  const hasAutoSignal = includesAny(joined, ["auto", "autograph", "on-card", "on card"]);
  return hasRcSignal && hasAutoSignal;
}

export function shouldConsiderBgs(
  context: SubmissionContext,
  userBorderlineToggle: boolean
): boolean {
  if (!userBorderlineToggle) return false;
  if (!isNumberedCard(context)) return false;
  if (!isRcAutoCard(context)) return false;
  return true;
}

export function getGradingFee(
  service: GradingService,
  tier: GradingTierKey
): number {
  if (service === "bgs") return BGS_TIERS.standard.fee;
  const key = tier in PSA_TIERS ? (tier as PsaTierKey) : "value";
  return PSA_TIERS[key].fee;
}

export function netProfitForScenario(
  sellPrice: number,
  rawCost: number,
  gradingFee: number
): number {
  return sellPrice * (1 - EBAY_FEE_RATE) - gradingFee - rawCost;
}

export function classifyCardStrength(estimate: GradeEstimate): "strong" | "borderline" | "risky" {
  const confidence = estimate.grade_probabilities?.confidence ?? "medium";
  if (confidence === "high") return "strong";
  if (confidence === "low") return "risky";
  return "borderline";
}

export function computeRiskRating(psa9Profit: number, psa10Profit: number): RiskRating {
  if (psa9Profit < 0) return "DO_NOT_GRADE";
  if (psa10Profit < 20) return "HIGH";
  if (Math.abs(psa9Profit) <= 0.99) return "MEDIUM";
  return "LOW";
}

export function computeVerdict(
  psa9Profit: number,
  cardStrength: "strong" | "borderline" | "risky"
): SubmissionVerdict {
  if (psa9Profit > 0 && cardStrength !== "risky") return "SUBMIT";
  if (psa9Profit <= 0) return "HOLD_RAW";
  return "BORDERLINE";
}

export function breakEvenGrade(
  profits: Array<{ grade: string; net: number }>
): string {
  const firstProfitable = profits.find((item) => item.net > 0);
  return firstProfitable?.grade ?? "No profitable grade";
}

export function recommendedService(
  context: SubmissionContext,
  userBorderlineToggle: boolean
): { service: GradingService; reason: string } {
  if (shouldConsiderBgs(context, userBorderlineToggle)) {
    return {
      service: "bgs",
      reason:
        "Numbered RC auto with borderline profile: BGS comparison is worth checking.",
    };
  }

  if (isModernPsaPreferredSet(context.setName)) {
    return {
      service: "psa",
      reason: "Modern chromium/set profile favors PSA resale premiums.",
    };
  }

  return {
    service: "psa",
    reason: "Defaulting to PSA based on stronger modern market liquidity.",
  };
}

export function fallbackMultiplier(
  rawPrice: number,
  grade: "PSA 10" | "PSA 9" | "PSA 8" | "BGS 9.5" | "BGS 9" | "BGS 8.5",
  context: SubmissionContext
): number {
  const isRcAuto = isRcAutoCard(context);
  const isNumbered = isNumberedCard(context);

  const baseMultiplier = (() => {
    if (isRcAuto) {
      if (grade === "PSA 10" || grade === "BGS 9.5") return 11.5;
      if (grade === "PSA 9" || grade === "BGS 9") return 4.5;
      return 2.75;
    }
    if (isNumbered) {
      if (grade === "PSA 10" || grade === "BGS 9.5") return 4.5;
      if (grade === "PSA 9" || grade === "BGS 9") return 2.4;
      return 1.9;
    }
    if (grade === "PSA 10" || grade === "BGS 9.5") return 2.9;
    if (grade === "PSA 9" || grade === "BGS 9") return 1.7;
    return 1.35;
  })();

  return Math.max(0, rawPrice * baseMultiplier);
}
