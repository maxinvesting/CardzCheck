import { createServiceClient } from "@/lib/supabase/server";

export const INITIAL_FREE_CREDITS = 2;
export const MAX_FREE_CREDITS = 2;
export const WEEKLY_GRANT_CREDITS = 1;
export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export type ScanCreditStatus = {
  remaining: number;
  nextGrantAt: string | null; // ISO timestamp of when next weekly credit arrives
  lastGrantAt: string | null;
};

/** Ensure the credit row exists, apply any pending weekly grant, and return current status. */
export async function getScanCreditStatus(userId: string): Promise<ScanCreditStatus> {
  const supabase = await createServiceClient();

  // Apply weekly grant (idempotent DB function)
  await supabase.rpc("apply_weekly_grade_credit", { p_user_id: userId });

  const { data } = await supabase
    .from("grade_scan_credits")
    .select("credits_remaining, last_weekly_grant_at")
    .eq("user_id", userId)
    .single();

  if (!data) {
    // Shouldn't happen after the rpc call, but handle gracefully
    return { remaining: INITIAL_FREE_CREDITS, nextGrantAt: null, lastGrantAt: null };
  }

  const lastGrantAt = data.last_weekly_grant_at ?? null;
  let nextGrantAt: string | null = null;
  if (lastGrantAt && data.credits_remaining < MAX_FREE_CREDITS) {
    const nextTs = new Date(new Date(lastGrantAt).getTime() + WEEK_MS);
    nextGrantAt = nextTs.toISOString();
  }

  return {
    remaining: data.credits_remaining,
    nextGrantAt,
    lastGrantAt,
  };
}

/**
 * Atomically consume one scan credit.
 * Returns true if a credit was available and consumed; false if none remain.
 */
export async function consumeScanCredit(userId: string): Promise<boolean> {
  const supabase = await createServiceClient();
  const { data, error } = await supabase.rpc("consume_grade_scan_credit", {
    p_user_id: userId,
  });

  if (error) {
    console.error("[scanCredits] Failed to consume credit:", error);
    return false;
  }

  return data === true;
}
