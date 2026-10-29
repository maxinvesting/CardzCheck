/**
 * Business debt — money the business owes.
 *
 * Mirrors the cash ledger (`lib/business/cash.ts`): the balance is *derived* as
 * the sum of an append-only ledger (`business_debt_transactions`). Every row is
 * a manual entry — positive raises the debt, negative pays it down.
 */

export type DebtTransactionKind = "opening_balance" | "adjustment";

export interface DebtTransaction {
  id: string;
  user_id: string;
  business_account_id: string;
  amount_cents: number;
  kind: DebtTransactionKind;
  note: string | null;
  occurred_at: string;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
}

export interface DebtSummary {
  /** Current debt in cents (sum of non-deleted transactions). */
  balance_cents: number;
  /** Whether a debt balance has ever been recorded. */
  initialized: boolean;
  /** Most recent transactions (newest first), capped by the caller. */
  recent: DebtTransaction[];
  /** True when the debt ledger table hasn't been migrated yet. */
  needs_migration: boolean;
}

export const DEBT_TABLE = "business_debt_transactions" as const;

type SupabaseLike = {
  from: (table: string) => any;
};

export function missingDebtTable(error: unknown): boolean {
  const code = String((error as { code?: string })?.code ?? "");
  const message = String((error as { message?: string })?.message ?? "").toLowerCase();
  return code === "42P01" || code === "PGRST205" || message.includes(DEBT_TABLE);
}

export async function getDebtSummary(
  supabase: SupabaseLike,
  businessAccountId: string,
  recentLimit = 50
): Promise<DebtSummary> {
  const { data, error } = await supabase
    .from(DEBT_TABLE)
    .select("*")
    .eq("business_account_id", businessAccountId)
    .eq("is_deleted", false)
    .order("occurred_at", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    if (missingDebtTable(error)) {
      return { balance_cents: 0, initialized: false, recent: [], needs_migration: true };
    }
    throw error;
  }

  const rows = (data ?? []) as DebtTransaction[];
  const balance = rows.reduce((sum, r) => sum + Math.trunc(Number(r.amount_cents) || 0), 0);

  return {
    balance_cents: balance,
    initialized: rows.length > 0,
    recent: rows.slice(0, Math.max(1, Math.min(recentLimit, 500))),
    needs_migration: false,
  };
}

export async function recordDebtTransaction(args: {
  supabase: SupabaseLike;
  userId: string;
  businessAccountId: string;
  amountCents: number;
  kind: DebtTransactionKind;
  note?: string | null;
}): Promise<void> {
  const { supabase, userId, businessAccountId, amountCents, kind, note = null } = args;
  const amount = Math.trunc(amountCents);
  if (amount === 0) return;

  const { error } = await supabase.from(DEBT_TABLE).insert({
    user_id: userId,
    business_account_id: businessAccountId,
    amount_cents: amount,
    kind,
    note: note?.trim() ? note.trim() : null,
  });
  if (error) throw error;
}

export async function softDeleteDebtTransaction(args: {
  supabase: SupabaseLike;
  businessAccountId: string;
  transactionId: string;
}): Promise<boolean> {
  const { supabase, businessAccountId, transactionId } = args;
  const { data, error } = await supabase
    .from(DEBT_TABLE)
    .update({ is_deleted: true, updated_at: new Date().toISOString() })
    .eq("id", transactionId)
    .eq("business_account_id", businessAccountId)
    .eq("is_deleted", false)
    .select("id")
    .maybeSingle();
  if (error) {
    if (missingDebtTable(error)) return false;
    throw error;
  }
  return Boolean(data);
}
