/**
 * GET /api/auth/ebay/callback
 * eBay OAuth callback — exchanges the code for tokens and stores them.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { exchangeCode, fetchEbayIdentity } from "@/lib/ebay/selling/oauth";
import { hasBusinessAccess } from "@/lib/access";

export const dynamic = "force-dynamic";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const searchParams = req.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const errorParam = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  // eBay returned an error (e.g. user denied consent)
  if (errorParam) {
    console.warn("[ebay/callback] eBay returned error:", errorParam, errorDescription);
    return NextResponse.redirect(
      `${SITE_URL}/business/settings?ebay=denied&error=${encodeURIComponent(errorDescription ?? errorParam)}`
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(`${SITE_URL}/business/settings?ebay=error&error=missing_params`);
  }

  // Validate CSRF state
  const storedState = req.cookies.get("ebay_oauth_state")?.value;
  if (!storedState || storedState !== state) {
    console.warn("[ebay/callback] CSRF state mismatch");
    return NextResponse.redirect(`${SITE_URL}/business/settings?ebay=error&error=state_mismatch`);
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.redirect(`${SITE_URL}/login`);
    }

    const ok = await hasBusinessAccess(user.id);
    if (!ok) {
      return NextResponse.redirect(`${SITE_URL}/business/settings?ebay=error&error=not_business`);
    }

    // Exchange authorization code for tokens
    const tokens = await exchangeCode(code);

    const now = Date.now();
    const accessExpiresAt = new Date(now + tokens.expires_in * 1000).toISOString();
    const refreshExpiresAt = new Date(
      now + (tokens.refresh_token_expires_in ?? 47304000) * 1000  // default 18 months
    ).toISOString();

    // Fetch eBay identity for username display
    let ebayUserId: string | null = null;
    let ebayUsername: string | null = null;
    try {
      const identity = await fetchEbayIdentity(tokens.access_token);
      ebayUserId = identity.userId || null;
      ebayUsername = identity.username || null;
    } catch (err) {
      console.warn("[ebay/callback] identity fetch failed (non-fatal):", err);
    }

    // Upsert into ebay_accounts
    const { error: upsertError } = await supabase
      .from("ebay_accounts")
      .upsert(
        {
          user_id: user.id,
          ebay_user_id: ebayUserId,
          ebay_username: ebayUsername,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          access_token_expires_at: accessExpiresAt,
          refresh_token_expires_at: refreshExpiresAt,
          scopes: tokens.scope?.split(" ") ?? [],
          is_active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

    if (upsertError) {
      console.error("[ebay/callback] upsert error:", upsertError);
      throw upsertError;
    }

    const response = NextResponse.redirect(`${SITE_URL}/business/settings?ebay=connected`);
    // Clear the CSRF cookie
    response.cookies.delete("ebay_oauth_state");
    return response;
  } catch (err) {
    console.error("[ebay/callback] error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.redirect(
      `${SITE_URL}/business/settings?ebay=error&error=${encodeURIComponent(message)}`
    );
  }
}
