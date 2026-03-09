import { createServiceClient } from "@/lib/supabase/server";

// ─── Pricing (claude-sonnet-4-20250514 as of 2026-03) ────────────────────────
// $3.00 per 1M input tokens → 300 cents per 1M
// $15.00 per 1M output tokens → 1500 cents per 1M
const INPUT_COST_PER_1M_CENTS = 300;
const OUTPUT_COST_PER_1M_CENTS = 1500;

// ─── Monthly budgets by subscription tier ────────────────────────────────────
// "pro"      = personal tier  → $1.00 / month
// "business" = business tier  → $2.00 / month
// "free"     = no grading access (blocked upstream by canAccessFeature)
const TIER_MONTHLY_BUDGET_CENTS: Record<string, number> = {
  free: 0,
  pro: 100,      // $1.00
  business: 200, // $2.00
};

export type TokenBudgetCheck = {
  allowed: boolean;
  reason?: string;
  spentCents: number;
  budgetCents: number;
  remainingCents: number;
};

/** First day of the current UTC month, as a DATE string ("2026-03-01"). */
function currentPeriodStart(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}-01`;
}

/** Cost in cents for a single API call, rounded up to the nearest cent. */
export function calculateCostCents(inputTokens: number, outputTokens: number): number {
  const inputCents = (inputTokens / 1_000_000) * INPUT_COST_PER_1M_CENTS;
  const outputCents = (outputTokens / 1_000_000) * OUTPUT_COST_PER_1M_CENTS;
  return Math.ceil(inputCents + outputCents);
}

/**
 * Check whether a user still has budget remaining for this month.
 * Returns { allowed: false } when the budget is exhausted or undefined.
 */
export async function checkGradeTokenBudget(
  userId: string,
  tier: string
): Promise<TokenBudgetCheck> {
  const budgetCents = TIER_MONTHLY_BUDGET_CENTS[tier] ?? 0;

  if (budgetCents === 0) {
    return {
      allowed: false,
      reason: "Grade scanning is not available on your current plan.",
      spentCents: 0,
      budgetCents: 0,
      remainingCents: 0,
    };
  }

  const supabase = createServiceClient();
  const period = currentPeriodStart();

  const { data } = await supabase
    .from("grade_token_usage")
    .select("cost_usd_cents")
    .eq("user_id", userId)
    .eq("period_start", period)
    .single();

  const spentCents = data?.cost_usd_cents ?? 0;
  const remainingCents = Math.max(0, budgetCents - spentCents);
  const allowed = spentCents < budgetCents;
  const budgetDollars = (budgetCents / 100).toFixed(2);

  return {
    allowed,
    reason: allowed
      ? undefined
      : `Monthly scanning budget of $${budgetDollars} reached. Resets on the 1st of next month.`,
    spentCents,
    budgetCents,
    remainingCents,
  };
}

/**
 * Atomically add token counts + cost to the user's current-month record.
 * Uses a SECURITY DEFINER postgres function to avoid read-modify-write races.
 * Errors are logged but never thrown — usage tracking must never block the user.
 */
export async function recordGradeTokenUsage(
  userId: string,
  inputTokens: number,
  outputTokens: number
): Promise<void> {
  const costCents = calculateCostCents(inputTokens, outputTokens);
  const period = currentPeriodStart();
  const supabase = createServiceClient();

  const { error } = await supabase.rpc("increment_grade_token_usage", {
    p_user_id: userId,
    p_period_start: period,
    p_input_tokens: inputTokens,
    p_output_tokens: outputTokens,
    p_cost_cents: costCents,
  });

  if (error) {
    console.error("[token-budget] Failed to record grade token usage:", error);
  }
}
