/**
 * POST /api/marketplace/connect/onboard
 *
 * Ensures the seller has a Stripe Connect Express account and returns a fresh,
 * single-use onboarding link. The client redirects the browser to {url}.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ensureConnectAccount, createOnboardingLink } from "@/lib/marketplace/connect";

export const runtime = "nodejs";

export async function POST() {
  if (!process.env.STRIPE_SECRET_KEY?.trim()) {
    return NextResponse.json({ error: "stripe_not_configured" }, { status: 503 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  try {
    const accountId = await ensureConnectAccount(user.id, user.email);
    const url = await createOnboardingLink(
      accountId,
      // refresh_url: link expired / abandoned → start over
      `${appUrl}/api/marketplace/connect/return?status=refresh`,
      // return_url: Stripe sends the seller here when they finish
      `${appUrl}/api/marketplace/connect/return?status=done`
    );
    return NextResponse.json({ url });
  } catch (err) {
    console.error("[connect/onboard] failed", err);
    return NextResponse.json(
      { error: "onboarding_failed", message: err instanceof Error ? err.message : "unknown" },
      { status: 500 }
    );
  }
}
