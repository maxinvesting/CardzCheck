/**
 * GET /api/cron/marketplace-lifecycle
 * Vercel Cron — runs daily.
 *
 * For full-service listings only:
 *   - At 30+ days listed: reduce list price by 7.5%, status -> price_reduced.
 *   - At 60+ days listed: status -> flagged for admin review (no price change).
 *
 * Self-serve listings are exempt.
 *
 * Idempotent: day30_triggered_at / day60_triggered_at guard against repeats.
 * Protected by CRON_SECRET (Bearer header) — same pattern as ebay-purchase-sync.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { applyDay30Markdown, DAY30_DAYS, DAY60_DAYS } from "@/lib/marketplace/lifecycle";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type LifecycleListing = {
  id: string;
  list_price_cents: number;
  listed_at: string;
  status: string;
};

export async function GET(req: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) {
    console.error("[cron/marketplace-lifecycle] CRON_SECRET is not configured");
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createServiceClient();
  const now = new Date();
  const day30Cutoff = new Date(now.getTime() - DAY30_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const day60Cutoff = new Date(now.getTime() - DAY60_DAYS * 24 * 60 * 60 * 1000).toISOString();

  // ---- Day 30: price reduction -----------------------------------------
  const { data: day30Candidates, error: day30Err } = await supabase
    .from("listings")
    .select("id, list_price_cents, listed_at, status")
    .eq("mode", "full_service")
    .in("status", ["active"])
    .lte("listed_at", day30Cutoff)
    .is("day30_triggered_at", null);

  if (day30Err) {
    console.error("[cron/marketplace-lifecycle] day30 fetch error", day30Err);
    return NextResponse.json({ error: day30Err.message }, { status: 500 });
  }

  let day30Reduced = 0;
  let day30Errors = 0;
  for (const listing of (day30Candidates ?? []) as LifecycleListing[]) {
    try {
      const newPrice = applyDay30Markdown(listing.list_price_cents);
      const { error: updErr } = await supabase
        .from("listings")
        .update({
          list_price_cents: newPrice,
          status: "price_reduced",
          day30_triggered_at: now.toISOString(),
        })
        .eq("id", listing.id)
        .is("day30_triggered_at", null);
      if (updErr) throw updErr;

      const { error: histErr } = await supabase.from("pricing_history").insert({
        listing_id: listing.id,
        old_price_cents: listing.list_price_cents,
        new_price_cents: newPrice,
        reason: "day30_reduction",
        changed_by: null,
      });
      if (histErr) throw histErr;

      day30Reduced++;
    } catch (err) {
      console.error(`[cron/marketplace-lifecycle] day30 failed for listing ${listing.id}`, err);
      day30Errors++;
    }
  }

  // ---- Day 60: flag for admin review -----------------------------------
  const { data: day60Candidates, error: day60Err } = await supabase
    .from("listings")
    .select("id, list_price_cents, listed_at, status")
    .eq("mode", "full_service")
    .in("status", ["active", "price_reduced"])
    .lte("listed_at", day60Cutoff)
    .is("day60_triggered_at", null);

  if (day60Err) {
    console.error("[cron/marketplace-lifecycle] day60 fetch error", day60Err);
    return NextResponse.json({ error: day60Err.message }, { status: 500 });
  }

  let day60Flagged = 0;
  let day60Errors = 0;
  for (const listing of (day60Candidates ?? []) as LifecycleListing[]) {
    try {
      const { error: updErr } = await supabase
        .from("listings")
        .update({
          status: "flagged",
          day60_triggered_at: now.toISOString(),
        })
        .eq("id", listing.id)
        .is("day60_triggered_at", null);
      if (updErr) throw updErr;

      // Audit row only — no price change at day 60. The 'flagged_decision'
      // reason is reserved for the admin's eventual remove/return/self-serve choice.
      const { error: histErr } = await supabase.from("pricing_history").insert({
        listing_id: listing.id,
        old_price_cents: listing.list_price_cents,
        new_price_cents: listing.list_price_cents,
        reason: "day60_reduction",
        changed_by: null,
      });
      if (histErr) throw histErr;

      day60Flagged++;
    } catch (err) {
      console.error(`[cron/marketplace-lifecycle] day60 failed for listing ${listing.id}`, err);
      day60Errors++;
    }
  }

  const summary = {
    ran_at: now.toISOString(),
    day30: {
      candidates: day30Candidates?.length ?? 0,
      reduced: day30Reduced,
      errors: day30Errors,
    },
    day60: {
      candidates: day60Candidates?.length ?? 0,
      flagged: day60Flagged,
      errors: day60Errors,
    },
  };
  console.log("[cron/marketplace-lifecycle] done", summary);
  return NextResponse.json(summary);
}
