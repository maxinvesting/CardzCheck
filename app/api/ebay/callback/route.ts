import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  exchangeCodeForTokens,
  fetchEbayUsername,
} from "@/lib/ebay/user-oauth";

/**
 * GET /api/ebay/callback?code=...&state=...
 *
 * eBay redirects here after user authorizes (or denies) the connection.
 * Validates the CSRF state, exchanges the code for tokens, stores them,
 * then redirects back to Settings.
 */
export async function GET(request: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const settingsUrl = `${appUrl}/business/settings?ebay_connected=true`;
  const errorUrl = `${appUrl}/business/settings?ebay_error=`;

  try {
    const { searchParams } = request.nextUrl;
    const code = searchParams.get("code");
    const stateParam = searchParams.get("state");
    const errorParam = searchParams.get("error");

    // User denied the authorization
    if (errorParam) {
      return NextResponse.redirect(
        `${errorUrl}${encodeURIComponent("Authorization denied by eBay.")}`
      );
    }

    if (!code) {
      return NextResponse.redirect(
        `${errorUrl}${encodeURIComponent("No authorization code received from eBay.")}`
      );
    }

    // Validate CSRF state parameter
    const storedState = request.cookies.get("ebay_oauth_state")?.value;
    if (!storedState || storedState !== stateParam) {
      return NextResponse.redirect(
        `${errorUrl}${encodeURIComponent("Invalid OAuth state. Please try connecting again.")}`
      );
    }

    // Decode state to get userId
    let userId: string;
    try {
      const decoded = JSON.parse(
        Buffer.from(storedState, "base64url").toString()
      );
      userId = decoded.userId;
      // Verify token isn't too old (10 min max)
      if (!userId || Date.now() - decoded.ts > 10 * 60 * 1000) {
        throw new Error("State token expired");
      }
    } catch {
      return NextResponse.redirect(
        `${errorUrl}${encodeURIComponent("OAuth state expired. Please try connecting again.")}`
      );
    }

    // Verify the Supabase session matches the userId from state
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user || user.id !== userId) {
      return NextResponse.redirect(
        `${errorUrl}${encodeURIComponent("Session mismatch. Please try connecting again.")}`
      );
    }

    // Exchange authorization code for tokens
    const tokens = await exchangeCodeForTokens(code);

    // Fetch eBay username to confirm connection and show in UI
    const ebayUsername = await fetchEbayUsername(tokens.access_token);

    const expiresAt = new Date(
      Date.now() + tokens.expires_in * 1000
    ).toISOString();

    // Store tokens server-side only — never returned to client
    const { error: updateError } = await supabase
      .from("users")
      .update({
        ebay_oauth_access_token: tokens.access_token,
        ebay_oauth_refresh_token: tokens.refresh_token,
        ebay_oauth_token_expires_at: expiresAt,
        ebay_oauth_connected_username: ebayUsername,
      })
      .eq("id", userId);

    if (updateError) {
      console.error("Failed to store eBay tokens:", updateError);
      return NextResponse.redirect(
        `${errorUrl}${encodeURIComponent("Failed to save eBay connection. Please try again.")}`
      );
    }

    // Clear the CSRF cookie
    const redirectResponse = NextResponse.redirect(settingsUrl);
    redirectResponse.cookies.delete("ebay_oauth_state");
    return redirectResponse;
  } catch (err) {
    console.error("eBay OAuth callback error:", err);
    return NextResponse.redirect(
      `${errorUrl}${encodeURIComponent("An error occurred connecting your eBay account.")}`
    );
  }
}
