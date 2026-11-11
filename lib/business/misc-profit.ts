/**
 * Misc. profit (e.g. consignment payouts) — profit that isn't a sale or trade.
 *
 * The Sales page has always added it to its profit total; Financials and the
 * dashboard read it from here so every profit figure includes it the same way.
 * Entries are dated by day (`occurred_at` = YYYY-MM-DD) and treated as UTC
 * midnight, matching the UTC period/month buckets in financials.ts.
 */

export type MiscProfitEntry = { occurred_at: string; amount_cents: number };

type SupabaseLike = { from: (table: string) => any };

/** Misc profit entries on or after `fromIso`. Empty if the table isn't migrated. */
export async function fetchMiscProfit(
  supabase: SupabaseLike,
  businessAccountId: string,
  fromIso: string
): Promise<MiscProfitEntry[]> {
  try {
    const { data, error } = await supabase
      .from("business_misc_profit")
      .select("occurred_at, amount_cents")
      .eq("business_account_id", businessAccountId)
      .gte("occurred_at", fromIso.slice(0, 10));
    if (error) return [];
    return ((data ?? []) as MiscProfitEntry[]).filter((e) =>
      Number.isFinite(miscProfitTime(e))
    );
  } catch {
    return [];
  }
}

export function miscProfitTime(entry: MiscProfitEntry): number {
  return Date.parse(`${entry.occurred_at.slice(0, 10)}T00:00:00.000Z`);
}

/** Sum of misc profit within the half-open window [fromMs, toMs). */
export function sumMiscProfit(
  entries: MiscProfitEntry[],
  fromMs: number,
  toMs: number
): number {
  let total = 0;
  for (const entry of entries) {
    const t = miscProfitTime(entry);
    if (t < fromMs || t >= toMs) continue;
    total += Math.round(Number(entry.amount_cents) || 0);
  }
  return total;
}
