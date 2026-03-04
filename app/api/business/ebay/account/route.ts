/**
 * GET /api/business/ebay/account
 * Returns the connected eBay account status for the authenticated business user.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireBusinessAccess } from "@/lib/business/actions";
import type { EbayAccountStatus } from "@/types";

export const dynamic = "force-dynamic";

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
      .select("ebay_username, top_rated_seller, access_token_expires_at, is_active")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) throw error;

    const status: EbayAccountStatus = {
      connected: Boolean(account?.is_active),
      ebay_username: account?.ebay_username ?? null,
      top_rated_seller: account?.top_rated_seller ?? false,
      access_token_expires_at: account?.access_token_expires_at ?? null,
    };

    return NextResponse.json(status);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch eBay account";
    const status = (err as any)?.status ?? 500;
    return NextResponse.json({ error: message }, { status });
  }
}
