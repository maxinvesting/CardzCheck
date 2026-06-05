/**
 * GET /api/marketplace/connect/return
 *
 * Stripe redirects here after the seller finishes (or abandons) Express
 * onboarding. We sync the account's capability flags from Stripe, then bounce
 * the seller back to their orders dashboard.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPayoutAccount, syncAccountStatus } from "@/lib/marketplace/connect";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const dest = new URL("/marketplace/sell/orders", appUrl);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const acct = await getPayoutAccount(user.id);
    if (acct?.stripe_account_id) {
      try {
        await syncAccountStatus(acct.stripe_account_id);
      } catch (err) {
        console.error("[connect/return] sync failed", err);
      }
    }
  }

  dest.searchParams.set(
    "onboarding",
    req.nextUrl.searchParams.get("status") === "refresh" ? "incomplete" : "done"
  );
  return NextResponse.redirect(dest);
}
