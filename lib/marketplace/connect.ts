/**
 * Stripe Connect (Express) helpers for marketplace seller payouts.
 *
 * Every seller who wants to receive money for a sale gets a Stripe Connect
 * Express account. Buyers are charged on the platform account; the sale amount
 * (minus the CardzCheck platform fee, taken as a Stripe `application_fee_amount`)
 * is transferred to the seller's connected account via a destination charge.
 *
 * This module is the single source of truth for:
 *   - creating / retrieving a seller's connected account
 *   - generating onboarding links
 *   - syncing capability status (charges_enabled / payouts_enabled) into
 *     `seller_payout_accounts`
 *
 * Server-only. Never import from a client component.
 */

import { stripe } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/server";

export interface PayoutAccount {
  user_id: string;
  stripe_account_id: string | null;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
  ship_from: ShipFromAddress | null;
  onboarded_at: string | null;
}

export interface ShipFromAddress {
  name: string;
  phone?: string | null;
  street1: string;
  street2?: string | null;
  city: string;
  state: string;
  zip: string;
  country: string;
}

/** Read the seller's payout account row (or null if they've never started). */
export async function getPayoutAccount(
  userId: string
): Promise<PayoutAccount | null> {
  const service = await createServiceClient();
  const { data } = await service
    .from("seller_payout_accounts")
    .select(
      "user_id, stripe_account_id, charges_enabled, payouts_enabled, details_submitted, ship_from, onboarded_at"
    )
    .eq("user_id", userId)
    .maybeSingle();
  return (data as PayoutAccount | null) ?? null;
}

/**
 * Get the seller's connected account id, creating an Express account (and the
 * local row) if one doesn't exist yet. Idempotent.
 */
export async function ensureConnectAccount(
  userId: string,
  email: string | null | undefined
): Promise<string> {
  const service = await createServiceClient();

  const existing = await getPayoutAccount(userId);
  if (existing?.stripe_account_id) {
    return existing.stripe_account_id;
  }

  const account = await stripe().accounts.create({
    type: "express",
    email: email ?? undefined,
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    business_type: "individual",
    metadata: { cardzcheck_user_id: userId },
  });

  await service.from("seller_payout_accounts").upsert(
    {
      user_id: userId,
      stripe_account_id: account.id,
      charges_enabled: account.charges_enabled ?? false,
      payouts_enabled: account.payouts_enabled ?? false,
      details_submitted: account.details_submitted ?? false,
    },
    { onConflict: "user_id" }
  );

  return account.id;
}

/**
 * Create a fresh Account Onboarding link. Stripe links are single-use and
 * short-lived, so we always mint a new one on demand.
 */
export async function createOnboardingLink(
  accountId: string,
  refreshUrl: string,
  returnUrl: string
): Promise<string> {
  const link = await stripe().accountLinks.create({
    account: accountId,
    refresh_url: refreshUrl,
    return_url: returnUrl,
    type: "account_onboarding",
  });
  return link.url;
}

/**
 * Re-fetch the account from Stripe and persist its capability flags. Returns
 * the refreshed local view. Safe to call from webhooks (account.updated) and
 * from the onboarding return handler.
 */
export async function syncAccountStatus(
  accountId: string
): Promise<{
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
}> {
  const account = await stripe().accounts.retrieve(accountId);
  const charges_enabled = account.charges_enabled ?? false;
  const payouts_enabled = account.payouts_enabled ?? false;
  const details_submitted = account.details_submitted ?? false;

  const service = await createServiceClient();
  await service
    .from("seller_payout_accounts")
    .update({
      charges_enabled,
      payouts_enabled,
      details_submitted,
      onboarded_at: payouts_enabled ? new Date().toISOString() : null,
    })
    .eq("stripe_account_id", accountId);

  return { charges_enabled, payouts_enabled, details_submitted };
}

/**
 * Whether a seller is fully ready to receive money for a sale. This is the
 * gate the checkout endpoint enforces before letting a buyer pay.
 */
export function isPayoutReady(acct: PayoutAccount | null): boolean {
  return Boolean(
    acct?.stripe_account_id && acct.charges_enabled && acct.payouts_enabled
  );
}
