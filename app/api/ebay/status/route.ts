import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/ebay/status
 *
 * Returns the current eBay connection status for the authenticated user.
 * Never returns token values — only username (for display) and timestamps.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: userData, error } = await supabase
      .from("users")
      .select(
        "ebay_oauth_connected_username, ebay_oauth_token_expires_at, ebay_last_inventory_sync, ebay_last_sales_sync, ebay_fee_rate"
      )
      .eq("id", user.id)
      .maybeSingle();

    if (error || !userData) {
      return NextResponse.json({
        connected: false,
        username: null,
        last_inventory_sync: null,
        last_sales_sync: null,
        fee_rate: "standard",
      });
    }

    // Determine if actually connected (has username = tokens were stored)
    const connected = !!userData.ebay_oauth_connected_username;

    return NextResponse.json({
      connected,
      username: userData.ebay_oauth_connected_username ?? null,
      token_expires_at: userData.ebay_oauth_token_expires_at ?? null,
      last_inventory_sync: userData.ebay_last_inventory_sync ?? null,
      last_sales_sync: userData.ebay_last_sales_sync ?? null,
      fee_rate: userData.ebay_fee_rate ?? "standard",
    });
  } catch (err) {
    console.error("eBay status error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
