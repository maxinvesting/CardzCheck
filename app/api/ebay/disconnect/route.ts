import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/ebay/disconnect
 *
 * Clears the user's eBay OAuth tokens from the database.
 * eBay's token revocation endpoint is best-effort; we always clear local tokens.
 */
export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch current refresh token for revocation (best-effort)
    const { data: userData } = await supabase
      .from("users")
      .select("ebay_oauth_refresh_token, ebay_oauth_access_token")
      .eq("id", user.id)
      .maybeSingle();

    // Best-effort token revocation with eBay (don't fail if this doesn't work)
    const clientId = process.env.EBAY_CLIENT_ID;
    const clientSecret = process.env.EBAY_CLIENT_SECRET;
    if (clientId && clientSecret && userData?.ebay_oauth_refresh_token) {
      try {
        const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
        await fetch("https://api.ebay.com/identity/v1/oauth2/token/revoke", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization: `Basic ${credentials}`,
          },
          body: new URLSearchParams({
            token: userData.ebay_oauth_refresh_token,
            token_type_hint: "refresh_token",
          }).toString(),
        });
      } catch {
        // Revocation is best-effort; proceed with local cleanup
      }
    }

    // Clear all eBay OAuth fields from users table
    const { error: updateError } = await supabase
      .from("users")
      .update({
        ebay_oauth_access_token: null,
        ebay_oauth_refresh_token: null,
        ebay_oauth_token_expires_at: null,
        ebay_oauth_connected_username: null,
      })
      .eq("id", user.id);

    if (updateError) {
      console.error("Failed to clear eBay tokens:", updateError);
      return NextResponse.json(
        { error: "Failed to disconnect eBay account" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("eBay disconnect error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
