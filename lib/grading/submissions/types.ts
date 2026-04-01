export const SUBMISSION_MODES = ["mock", "actual"] as const;
export const SUBMISSION_GRADERS = ["psa"] as const;
export const SUBMISSION_STATUSES = [
  "draft",
  "ready",
  "shipped",
  "arrived",
  "grading",
  "qa",
  "shipped_back",
  "received",
  "completed",
] as const;
export const SUBMISSION_SOURCE_TYPES = ["collection", "watchlist", "manual"] as const;

export type SubmissionMode = (typeof SUBMISSION_MODES)[number];
export type SubmissionGrader = (typeof SUBMISSION_GRADERS)[number];
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];
export type SubmissionSourceType = (typeof SUBMISSION_SOURCE_TYPES)[number];

export type PsaDistribution = {
  "10": number;
  "9": number;
  "8": number;
  "7_or_lower": number;
};

export type EstimatedValueByGradeCents = {
  "10": number | null;
  "9": number | null;
  "8": number | null;
  "7_or_lower": number | null;
};

export type SubmissionCardIdentity = {
  player_name: string;
  year?: string | null;
  set_name?: string | null;
  card_number?: string | null;
  parallel_type?: string | null;
  variation?: string | null;
  insert?: string | null;
};

export type GradingSubmissionRecord = {
  id: string;
  user_id: string;
  name: string;
  mode: SubmissionMode;
  grader: SubmissionGrader;
  status: SubmissionStatus;
  psa_order_id: string | null;
  service_level: string | null;
  declared_value_cents: number;
  shipping_cents: number;
  insurance_cents: number;
  fees_estimate_cents: number;
  fees_actual_cents: number | null;
  created_at: string;
  updated_at: string;
};

export type GradingSubmissionItemRecord = {
  id: string;
  submission_id: string;
  user_id: string;
  source_type: SubmissionSourceType;
  source_id: string | null;
  title: string;
  quantity: number;
  cost_basis_cents: number | null;
  predicted_distribution: PsaDistribution;
  target_grade: string | null;
  estimated_value_by_grade: EstimatedValueByGradeCents;
  expected_value_cents: number;
  break_even_grade: string | null;
  risk_flags: string[];
  actual_grade: string | null;
  cert_number: string | null;
  created_at: string;
  updated_at: string;
};

export type SubmissionItemComputed = {
  id: string;
  expected_profit_cents: number;
  below_break_even_probability: number | null;
  break_even_grade: string | null;
};

export type SubmissionSummary = {
  total_cards: number;
  total_estimated_fees_cents: number;
  total_expected_value_cents: number;
  total_expected_profit_cents: number;
  downside_percent: number;
};

export type SubmissionComparisonRow = {
  item_id: string;
  title: string;
  predicted_most_likely_grade: string | null;
  actual_grade: string | null;
  predicted_probability: number | null;
};

// ─── AI Walkthrough ──────────────────────────────────────────────────────────

export type SubmissionAIWalkthroughVerdict = "SUBMIT" | "BORDERLINE" | "SKIP";

export type SubmissionAIWalkthroughResult = {
  pros: string[];
  cons: string[];
  verdict: SubmissionAIWalkthroughVerdict;
  keyNumbers: {
    profitPsa9: number;
    profitPsa10: number;
    breakEvenGrade: string;
  };
  summary: string;
};

export type SubmissionAIWalkthroughState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; data: SubmissionAIWalkthroughResult }
  | { status: "error"; message: string };
