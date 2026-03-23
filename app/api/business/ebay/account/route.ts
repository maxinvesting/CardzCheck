/**
 * GET /api/business/ebay/account
 * Returns the connected eBay account status for the authenticated business user.
 */

/**
 * GET  /api/business/ebay/account  — Returns the connected eBay account status.
 * PATCH /api/business/ebay/account  — Updates the store_tier preference.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireBusinessAccess } from "@/lib/business/actions";
import type { EbayAccountStatus } from "@/types";
import type { StoreTier } from "@/lib/business/EbayProfitEngine";

export const dynamic = "force-dynamic";

const VALID_STORE_TIERS: StoreTier[] = [
  "none",
  "starter",
  "basic",
  "premium",
  "anchor",
  "enterprise",
];

export async function GET(): Promise<NextResponse> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await requireBusinessAccess(user.id);

    const { data: account, error } = await supabase
      .from("ebay_accounts")
      .select(
        "ebay_username, top_rated_seller, access_token_expires_at, is_active, store_tier, scopes"
      )
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) throw error;

    const status: EbayAccountStatus = {
      connected: Boolean(account?.is_active),
      ebay_username: account?.ebay_username ?? null,
      top_rated_seller: account?.top_rated_seller ?? false,
      access_token_expires_at: account?.access_token_expires_at ?? null,
      store_tier: (account?.store_tier as StoreTier) ?? "none",
      scopes: account?.scopes ?? [],
    };

    return NextResponse.json(status);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to fetch eBay account";
    const status = (err as any)?.status ?? 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(request: Request): Promise<NextResponse> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await requireBusinessAccess(user.id);

    const body = await request.json();
    const { store_tier } = body as { store_tier?: unknown };

    if (!store_tier || !VALID_STORE_TIERS.includes(store_tier as StoreTier)) {
      return NextResponse.json(
        {
          error: `store_tier must be one of: ${VALID_STORE_TIERS.join(", ")}`,
        },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("ebay_accounts")
      .update({ store_tier: store_tier as StoreTier })
      .eq("user_id", user.id);

    if (error) throw error;

    return NextResponse.json({ store_tier });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to update store tier";
    const status = (err as any)?.status ?? 500;
    return NextResponse.json({ error: message }, { status });
  }
}
