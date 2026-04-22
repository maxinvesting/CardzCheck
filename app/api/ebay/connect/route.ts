import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildEbayAuthUrl } from "@/lib/ebay/user-oauth";
import { hasBusinessAccess } from "@/lib/access";

/**
 * GET /api/ebay/connect
 *
 * Initiates the eBay OAuth authorization code flow.
 * Generates a CSRF state token and redirects the user to eBay's auth page.
 * Only available to Business subscribers.
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

    const isBusinessUser = await hasBusinessAccess(user.id);
    if (!isBusinessUser) {
      return NextResponse.json(
        { error: "Business subscription required to connect eBay" },
        { status: 403 }
      );
    }

    // Generate a CSRF state token — we use a simple time+userId hash.
    // Stored in a short-lived cookie so we can validate on callback.
    const stateToken = Buffer.from(
      JSON.stringify({ userId: user.id, ts: Date.now() })
    ).toString("base64url");

    const authUrl = buildEbayAuthUrl(stateToken);

    const response = NextResponse.redirect(authUrl);
    // Store state in HttpOnly cookie for CSRF validation on callback
    response.cookies.set("ebay_oauth_state", stateToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 10 * 60, // 10 minutes
      path: "/",
    });

    return response;
  } catch (err) {
    console.error("eBay connect error:", err);
    return NextResponse.json(
      { error: "Failed to initiate eBay connection" },
      { status: 500 }
    );
  }
}
