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

export async function GET(): Promise<NextResponse> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.redirect(new URL("/login", process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"));
    }

    const ok = await hasBusinessAccess(user.id);
    if (!ok) {
      return NextResponse.json({ error: "Business subscription required" }, { status: 403 });
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
    const message = err instanceof Error ? err.message : "Failed to initiate eBay connection";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
