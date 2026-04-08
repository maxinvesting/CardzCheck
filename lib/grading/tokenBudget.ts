import { createServiceClient } from "@/lib/supabase/server";

// Pricing for claude-sonnet-4-20250514.
const INPUT_COST_PER_1M_CENTS = 300;
const OUTPUT_COST_PER_1M_CENTS = 1500;

export const TIER_MONTHLY_BUDGET_CENTS: Record<string, number> = {
  free: 0,
  pro: 25,
  business: 100,
};

export type GradeTokenBudgetStatus = {
  allowed: boolean;
  reason?: string;
  spentCents: number;
  reservedCents: number;
  budgetCents: number;
  remainingCents: number;
  periodStart: string;
};

export type GradeTokenBudgetReservation = GradeTokenBudgetStatus & {
  reservationId: string | null;
};

function currentPeriodStart(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}-01`;
}

function formatBudgetDollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function getTierMonthlyBudgetCents(tier: string): number {
  return TIER_MONTHLY_BUDGET_CENTS[tier] ?? 0;
}

export function calculateCostCents(inputTokens: number, outputTokens: number): number {
  const inputCents = (inputTokens / 1_000_000) * INPUT_COST_PER_1M_CENTS;
  const outputCents = (outputTokens / 1_000_000) * OUTPUT_COST_PER_1M_CENTS;
  return Math.ceil(inputCents + outputCents);
}

async function getReservedCents(
  userId: string,
  periodStart: string
): Promise<number> {
  const supabase = await createServiceClient();
  const { data, error } = await supabase
    .from("grade_token_reservations")
    .select("reserved_cost_cents")
    .eq("user_id", userId)
    .eq("period_start", periodStart)
    .eq("status", "reserved");

  if (error) {
    console.error("[token-budget] Failed to read reserved grade token budget:", error);
    return 0;
  }

  return (data ?? []).reduce((sum, row) => sum + (row.reserved_cost_cents ?? 0), 0);
}

export async function checkGradeTokenBudget(
  userId: string,
  tier: string
): Promise<GradeTokenBudgetStatus> {
  const budgetCents = getTierMonthlyBudgetCents(tier);
  const periodStart = currentPeriodStart();

  if (budgetCents === 0) {
    return {
      allowed: false,
      reason: "Grade scanning is not available on your current plan.",
      spentCents: 0,
      reservedCents: 0,
      budgetCents: 0,
      remainingCents: 0,
      periodStart,
    };
  }

  const supabase = await createServiceClient();
  const [{ data }, reservedCents] = await Promise.all([
    supabase
      .from("grade_token_usage")
      .select("cost_usd_cents")
      .eq("user_id", userId)
      .eq("period_start", periodStart)
      .maybeSingle(),
    getReservedCents(userId, periodStart),
  ]);

  const spentCents = data?.cost_usd_cents ?? 0;
  const remainingCents = Math.max(0, budgetCents - spentCents - reservedCents);
  const allowed = remainingCents > 0;

  return {
    allowed,
    reason: allowed
      ? undefined
      : `Monthly scanning budget of $${formatBudgetDollars(budgetCents)} reached. Resets on the 1st of next month.`,
    spentCents,
    reservedCents,
    budgetCents,
    remainingCents,
    periodStart,
  };
}

export async function reserveGradeTokenBudget(
  userId: string,
  tier: string
): Promise<GradeTokenBudgetReservation> {
  const budgetCents = getTierMonthlyBudgetCents(tier);
  const periodStart = currentPeriodStart();

  if (budgetCents === 0) {
    return {
      allowed: false,
      reason: "Grade scanning is not available on your current plan.",
      reservationId: null,
      spentCents: 0,
      reservedCents: 0,
      budgetCents: 0,
      remainingCents: 0,
      periodStart,
    };
  }

  const supabase = await createServiceClient();
  const { data, error } = await supabase.rpc("reserve_grade_token_budget", {
    p_user_id: userId,
    p_period_start: periodStart,
    p_budget_cents: budgetCents,
  });

  if (error) {
    console.error("[token-budget] Failed to reserve grade token budget:", error);
    return {
      allowed: false,
      reason: "Could not verify your monthly scanning budget right now.",
      reservationId: null,
      spentCents: 0,
      reservedCents: 0,
      budgetCents,
      remainingCents: 0,
      periodStart,
    };
  }

  const row = Array.isArray(data) ? data[0] : data;
  const allowed = row?.allowed === true;
  const spentCents = row?.spent_cents ?? 0;
  const reservedCents = row?.reserved_cents ?? 0;
  const remainingCents = row?.remaining_cents ?? 0;

  return {
    allowed,
    reason: allowed
      ? undefined
      : `Monthly scanning budget of $${formatBudgetDollars(budgetCents)} reached. Resets on the 1st of next month.`,
    reservationId: row?.reservation_id ?? null,
    spentCents,
    reservedCents,
    budgetCents,
    remainingCents,
    periodStart,
  };
}

export async function settleGradeTokenBudgetReservation(
  reservationId: string,
  inputTokens: number,
  outputTokens: number
): Promise<boolean> {
  const supabase = await createServiceClient();
  const { data, error } = await supabase.rpc("settle_grade_token_budget_reservation", {
    p_reservation_id: reservationId,
    p_input_tokens: inputTokens,
    p_output_tokens: outputTokens,
    p_actual_cost_cents: calculateCostCents(inputTokens, outputTokens),
  });

  if (error) {
    console.error("[token-budget] Failed to settle grade token reservation:", error);
    return false;
  }

  return data === true;
}

export async function releaseGradeTokenBudgetReservation(
  reservationId: string
): Promise<boolean> {
  const supabase = await createServiceClient();
  const { data, error } = await supabase.rpc("release_grade_token_budget_reservation", {
    p_reservation_id: reservationId,
  });

  if (error) {
    console.error("[token-budget] Failed to release grade token reservation:", error);
    return false;
  }

  return data === true;
}

export async function recordGradeTokenUsage(
  userId: string,
  inputTokens: number,
  outputTokens: number
): Promise<void> {
  const costCents = calculateCostCents(inputTokens, outputTokens);
  const periodStart = currentPeriodStart();
  const supabase = await createServiceClient();

  const { error } = await supabase.rpc("increment_grade_token_usage", {
    p_user_id: userId,
    p_period_start: periodStart,
    p_input_tokens: inputTokens,
    p_output_tokens: outputTokens,
    p_cost_cents: costCents,
  });

  if (error) {
    console.error("[token-budget] Failed to record grade token usage:", error);
  }
}
