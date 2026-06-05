/**
 * GET   /api/marketplace/connect          — seller payout-account status
 *        ?sync=1 forces a live refresh from Stripe.
 * PATCH /api/marketplace/connect          — save the seller's ship-from address
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  getPayoutAccount,
  isPayoutReady,
  syncAccountStatus,
} from "@/lib/marketplace/connect";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let account = await getPayoutAccount(user.id);

  const wantSync = req.nextUrl.searchParams.get("sync");
  if (wantSync && account?.stripe_account_id) {
    try {
      await syncAccountStatus(account.stripe_account_id);
      account = await getPayoutAccount(user.id);
    } catch (err) {
      console.error("[connect] sync failed", err);
    }
  }

  return NextResponse.json({
    configured: Boolean(process.env.STRIPE_SECRET_KEY?.trim()),
    account: account
      ? {
          stripe_account_id: account.stripe_account_id,
          charges_enabled: account.charges_enabled,
          payouts_enabled: account.payouts_enabled,
          details_submitted: account.details_submitted,
          ship_from: account.ship_from,
          onboarded_at: account.onboarded_at,
        }
      : null,
    ready: isPayoutReady(account),
    has_ship_from: Boolean(account?.ship_from?.street1),
  });
}

const shipFromSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(40).optional().nullable(),
  street1: z.string().trim().min(1).max(200),
  street2: z.string().trim().max(200).optional().nullable(),
  city: z.string().trim().min(1).max(120),
  state: z.string().trim().min(2).max(40),
  zip: z.string().trim().min(3).max(12),
  country: z.string().trim().length(2).default("US"),
});

export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = shipFromSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from("seller_payout_accounts")
    .upsert(
      { user_id: user.id, ship_from: parsed.data },
      { onConflict: "user_id" }
    );

  if (error) {
    return NextResponse.json(
      { error: "save_failed", message: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, ship_from: parsed.data });
}
