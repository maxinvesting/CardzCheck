/**
 * Business "cash on hand" — the liquid cash a seller holds outside of inventory.
 *
 * The balance is *derived*, never stored: it's the sum of an append-only ledger
 * of cash movements (`business_cash_transactions`). Manual entries anchor the
 * balance (opening balance + adjustments); sales and trades write cash rows
 * automatically and reverse them (soft delete) when the source is undone.
 *
 * Pure helpers (computeCashBalance / cashDeltaForSetBalance / netCashForTrade /
 * cashInForSale) are split out so the money math is unit-testable without a DB.
 */

export type CashTransactionKind =
  | "opening_balance"
  | "adjustment"
  | "sale"
  | "trade"
  | "purchase";

export type CashSourceType = "sale" | "trade";

export interface CashTransaction {
  id: string;
  user_id: string;
  business_account_id: string;
  amount_cents: number;
  kind: CashTransactionKind;
  source_type: CashSourceType | null;
  source_id: string | null;
  note: string | null;
  occurred_at: string;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
}

export interface CashSummary {
  /** Current balance in cents (sum of non-deleted transactions). */
  balance_cents: number;
  /** Count of non-deleted transactions. */
  transaction_count: number;
  /** ISO timestamp of the most recent cash movement, or null if none. */
  last_updated_at: string | null;
  /** Whether the business has ever set a balance / recorded a cash row. */
  initialized: boolean;
  /** Most recent transactions (newest first), capped by the caller. */
  recent: CashTransaction[];
  /** True when the cash ledger table hasn't been migrated yet. */
  needs_migration: boolean;
}

const CASH_TABLE = "business_cash_transactions" as const;

type SupabaseLike = {
  from: (table: string) => any;
};

function toInt(value: unknown): number {
  if (value == null) return 0;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

export function missingCashTable(error: unknown): boolean {
  const code = String((error as { code?: string })?.code ?? "");
  const message = String((error as { message?: string })?.message ?? "").toLowerCase();
  return (
    code === "42P01" ||
    code === "PGRST205" ||
    message.includes(CASH_TABLE)
  );
}

// ── Pure money math (unit-tested) ──────────────────────────────────────────

/** Sum non-deleted transactions to get the current balance. */
export function computeCashBalance(
  transactions: Array<Pick<CashTransaction, "amount_cents" | "is_deleted">>
): number {
  let total = 0;
  for (const tx of transactions) {
    if (tx.is_deleted) continue;
    total += toInt(tx.amount_cents);
  }
  return total;
}

/** Signed adjustment needed to move `current` to `target`. */
export function cashDeltaForSetBalance(currentCents: number, targetCents: number): number {
  return toInt(targetCents) - toInt(currentCents);
}

/** Net cash impact of a trade: cash received in, cash paid out. */
export function netCashForTrade(
  cashReceivedCents: number,
  cashPaidCents: number
): number {
  return toInt(cashReceivedCents) - toInt(cashPaidCents);
}

/** Cash a sale puts in the bank — the net payout actually received. */
export function cashInForSale(netPayoutCents: number | null | undefined): number {
  return toInt(netPayoutCents);
}

// ── DB helpers (server-side, RLS-scoped client) ────────────────────────────

/**
 * Current cash balance in cents for an account. Returns 0 if the ledger table
 * isn't migrated yet (graceful degradation, consistent with other business
 * subsystems).
 */
export async function getCashBalanceCents(
  supabase: SupabaseLike,
  businessAccountId: string
): Promise<number> {
  const { data, error } = await supabase
    .from(CASH_TABLE)
    .select("amount_cents")
    .eq("business_account_id", businessAccountId)
    .eq("is_deleted", false);

  if (error) {
    if (missingCashTable(error)) return 0;
    throw error;
  }
  return computeCashBalance(
    ((data ?? []) as Array<{ amount_cents: number }>).map((r) => ({
      amount_cents: r.amount_cents,
      is_deleted: false,
    }))
  );
}

/**
 * Full cash summary: balance + recent transactions. Degrades to an empty,
 * un-initialized summary if the table is missing.
 */
export async function getCashSummary(
  supabase: SupabaseLike,
  businessAccountId: string,
  recentLimit = 50
): Promise<CashSummary> {
  const { data, error } = await supabase
    .from(CASH_TABLE)
    .select("*")
    .eq("business_account_id", businessAccountId)
    .eq("is_deleted", false)
    .order("occurred_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(recentLimit, 500)));

  if (error) {
    if (missingCashTable(error)) {
      return {
        balance_cents: 0,
        transaction_count: 0,
        last_updated_at: null,
        initialized: false,
        recent: [],
        needs_migration: true,
      };
    }
    throw error;
  }

  const rows = (data ?? []) as CashTransaction[];
  // The balance must reflect *all* non-deleted rows, not just the recent page.
  const balance = await getCashBalanceCents(supabase, businessAccountId);

  return {
    balance_cents: balance,
    transaction_count: rows.length,
    last_updated_at: rows[0]?.occurred_at ?? null,
    initialized: rows.length > 0,
    recent: rows,
    needs_migration: false,
  };
}

/**
 * Append a cash transaction. Returns the created row id (or null if the table is
 * missing — callers treat cash tracking as best-effort so a missing migration
 * never blocks recording a sale/trade).
 */
export async function recordCashTransaction(args: {
  supabase: SupabaseLike;
  userId: string;
  businessAccountId: string;
  amountCents: number;
  kind: CashTransactionKind;
  sourceType?: CashSourceType | null;
  sourceId?: string | null;
  note?: string | null;
  occurredAt?: string | null;
}): Promise<string | null> {
  const {
    supabase,
    userId,
    businessAccountId,
    amountCents,
    kind,
    sourceType = null,
    sourceId = null,
    note = null,
    occurredAt = null,
  } = args;

  const amount = toInt(amountCents);
  // Zero-value movements carry no information — skip them.
  if (amount === 0) return null;

  const insert: Record<string, unknown> = {
    user_id: userId,
    business_account_id: businessAccountId,
    amount_cents: amount,
    kind,
    source_type: sourceType,
    source_id: sourceId,
    note: note?.trim() ? note.trim() : null,
  };
  if (occurredAt) insert.occurred_at = occurredAt;

  const { data, error } = await supabase
    .from(CASH_TABLE)
    .insert(insert)
    .select("id")
    .single();

  if (error) {
    if (missingCashTable(error)) return null;
    // Best-effort: a cash write should never break the underlying sale/trade.
    console.warn("[cash] failed to record cash transaction", error);
    return null;
  }
  return (data as { id: string } | null)?.id ?? null;
}

/**
 * Soft-delete the cash rows tied to a given sale/trade. Used when a sale or
 * trade is undone or deleted so its cash impact unwinds cleanly. Best-effort.
 */
export async function reverseCashBySource(args: {
  supabase: SupabaseLike;
  businessAccountId: string;
  sourceType: CashSourceType;
  sourceId: string;
}): Promise<void> {
  const { supabase, businessAccountId, sourceType, sourceId } = args;
  if (!sourceId) return;

  const { error } = await supabase
    .from(CASH_TABLE)
    .update({ is_deleted: true, updated_at: new Date().toISOString() })
    .eq("business_account_id", businessAccountId)
    .eq("source_type", sourceType)
    .eq("source_id", sourceId)
    .eq("is_deleted", false);

  if (error && !missingCashTable(error)) {
    console.warn("[cash] failed to reverse cash by source", error);
  }
}

/** Soft-delete a single manual cash transaction by id (owner/manager action). */
export async function softDeleteCashTransaction(args: {
  supabase: SupabaseLike;
  businessAccountId: string;
  transactionId: string;
}): Promise<{ ok: boolean; notFound?: boolean }> {
  const { supabase, businessAccountId, transactionId } = args;

  const { data, error } = await supabase
    .from(CASH_TABLE)
    .update({ is_deleted: true, updated_at: new Date().toISOString() })
    .eq("id", transactionId)
    .eq("business_account_id", businessAccountId)
    .eq("is_deleted", false)
    .select("id")
    .maybeSingle();

  if (error) {
    if (missingCashTable(error)) return { ok: false, notFound: true };
    throw error;
  }
  return data ? { ok: true } : { ok: false, notFound: true };
}
