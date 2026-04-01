/**
 * DELETE /api/auth/ebay/disconnect
 * Revoke tokens and remove the ebay_accounts row.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { revokeToken } from "@/lib/ebay/selling/oauth";
import { hasBusinessAccess } from "@/lib/access";

export const dynamic = "force-dynamic";

export async function DELETE(): Promise<NextResponse> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ok = await hasBusinessAccess(user.id);
    if (!ok) {
      return NextResponse.json({ error: "Business subscription required" }, { status: 403 });
    }

    // Fetch existing tokens for revocation (best-effort)
    const { data: account } = await supabase
      .from("ebay_accounts")
      .select("access_token, refresh_token")
      .eq("user_id", user.id)
      .maybeSingle();

    if (account) {
      // Revoke both tokens on eBay — failures are non-fatal
      await Promise.allSettled([
        revokeToken(account.refresh_token, "refresh_token"),
        revokeToken(account.access_token, "access_token"),
      ]);
    }

    // Delete the local record
    const { error } = await supabase
      .from("ebay_accounts")
      .delete()
      .eq("user_id", user.id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[ebay/disconnect] error:", err);
    const message = err instanceof Error ? err.message : "Failed to disconnect eBay account";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
