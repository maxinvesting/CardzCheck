/**
 * GET /api/auth/ebay
 * Initiate eBay OAuth flow — builds the consent URL and redirects the user.
 * A CSRF state token is generated and stored in a short-lived cookie.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildAuthUrl } from "@/lib/ebay/selling/oauth";
import { hasBusinessAccess } from "@/lib/access";
import crypto from "crypto";

export const dynamic = "force-dynamic";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  process.env.NEXT_PUBLIC_APP_URL ??
  "http://localhost:3000";

const EBAY_ERROR_CODES: Record<string, string> = {
  "eBay credentials not configured": "config_missing",
  "Missing required eBay OAuth parameters": "params_missing",
};

function toErrorCode(message: string): string {
  return EBAY_ERROR_CODES[message] ?? "unknown_error";
}

export async function GET(): Promise<NextResponse> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.redirect(new URL("/login", SITE_URL));
    }

    const ok = await hasBusinessAccess(user.id);
    if (!ok) {
      return NextResponse.redirect(
        `${SITE_URL}/business/settings?ebay=error&code=not_business`
      );
    }

    // App credentials are required; redirect URI can come from EBAY_REDIRECT_URI or
    // NEXT_PUBLIC_APP_URL / NEXT_PUBLIC_SITE_URL / VERCEL_URL (see resolveEbayRedirectUri).
    if (!process.env.EBAY_CLIENT_ID?.trim() || !process.env.EBAY_CLIENT_SECRET?.trim()) {
      const message = "eBay credentials not configured";
      return NextResponse.redirect(
        `${SITE_URL}/business/settings?ebay=error&code=${toErrorCode(message)}`
      );
    }

    // Generate a CSRF state token
    const state = crypto.randomBytes(24).toString("hex");

    const authUrl = buildAuthUrl(state);

    const response = NextResponse.redirect(authUrl);
    // Store state in a short-lived httpOnly cookie for validation in the callback
    response.cookies.set("ebay_oauth_state", state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600, // 10 minutes
      path: "/",
    });

    return response;
  } catch (err) {
    console.error("[ebay/oauth] initiate error:", err);
    const rawMessage =
      err instanceof Error ? err.message : "Failed to initiate eBay connection";
    const message =
      rawMessage.includes("must be set") ||
      rawMessage.includes("EBAY_CLIENT_ID") ||
      rawMessage.includes("OAuth callback")
        ? "eBay integration is not configured. Set EBAY_CLIENT_ID and EBAY_CLIENT_SECRET from the eBay Developer Program, and either EBAY_REDIRECT_URI or NEXT_PUBLIC_APP_URL (see .env.example)."
        : rawMessage;
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
