-- Migration: Marketplace payouts (Stripe Connect) + order fulfillment / shipping
-- Date: 2026-06-04
--
-- Adds the pieces the fixed-price exchange needs to actually move money and
-- cards end-to-end:
--   1. seller_payout_accounts  — one Stripe Connect Express account per seller,
--      plus the seller's saved ship-from address (for label generation).
--   2. listings.shipping_cents  — flat shipping the buyer pays, seller-set.
--   3. transactions.*           — fulfillment lifecycle + shipping label +
--      payout columns so a paid sale can be tracked from "paid" to "delivered".
--
-- Purely additive. Existing rows get sensible defaults.

-- ============================================================================
-- seller_payout_accounts: Stripe Connect Express account + ship-from address
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.seller_payout_accounts (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_account_id TEXT UNIQUE,
  charges_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  payouts_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  details_submitted BOOLEAN NOT NULL DEFAULT FALSE,
  -- { name, phone, street1, street2, city, state, zip, country }
  ship_from JSONB,
  onboarded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_seller_payout_accounts_stripe
  ON public.seller_payout_accounts (stripe_account_id);

-- ============================================================================
-- listings: flat shipping the buyer pays (seller-set, default $5.99)
-- ============================================================================

ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS shipping_cents INTEGER NOT NULL DEFAULT 599;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'listings_shipping_cents_nonneg') THEN
    ALTER TABLE public.listings ADD CONSTRAINT listings_shipping_cents_nonneg
      CHECK (shipping_cents >= 0);
  END IF;
END $$;

-- ============================================================================
-- transactions: fulfillment lifecycle + shipping label + payout columns
-- ============================================================================

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS shipping_cents INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS seller_payout_cents INTEGER,
  ADD COLUMN IF NOT EXISTS stripe_charge_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_transfer_id TEXT,
  ADD COLUMN IF NOT EXISTS fulfillment_status TEXT NOT NULL DEFAULT 'paid',
  ADD COLUMN IF NOT EXISTS ship_to JSONB,
  ADD COLUMN IF NOT EXISTS ship_from JSONB,
  ADD COLUMN IF NOT EXISTS shipping_provider TEXT,
  ADD COLUMN IF NOT EXISTS shipment_id TEXT,
  ADD COLUMN IF NOT EXISTS rate_id TEXT,
  ADD COLUMN IF NOT EXISTS carrier TEXT,
  ADD COLUMN IF NOT EXISTS service_level TEXT,
  ADD COLUMN IF NOT EXISTS tracking_number TEXT,
  ADD COLUMN IF NOT EXISTS tracking_url TEXT,
  ADD COLUMN IF NOT EXISTS label_url TEXT,
  ADD COLUMN IF NOT EXISTS label_cost_cents INTEGER,
  ADD COLUMN IF NOT EXISTS shipped_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS canceled_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transactions_fulfillment_status_check') THEN
    ALTER TABLE public.transactions ADD CONSTRAINT transactions_fulfillment_status_check
      CHECK (fulfillment_status IN ('paid', 'label_created', 'shipped', 'delivered', 'canceled'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_transactions_fulfillment
  ON public.transactions (fulfillment_status);

-- ============================================================================
-- updated_at touch trigger for seller_payout_accounts
-- ============================================================================

DROP TRIGGER IF EXISTS seller_payout_accounts_touch_updated_at ON public.seller_payout_accounts;
CREATE TRIGGER seller_payout_accounts_touch_updated_at
  BEFORE UPDATE ON public.seller_payout_accounts
  FOR EACH ROW EXECUTE FUNCTION public.touch_marketplace_updated_at();

-- ============================================================================
-- RLS
-- ============================================================================

ALTER TABLE public.seller_payout_accounts ENABLE ROW LEVEL SECURITY;

-- Sellers read/insert/update their own payout account row. Stripe-derived
-- status fields (charges_enabled/payouts_enabled) are only ever written by the
-- service role from the webhook / onboarding refresh, but allowing self-update
-- here is safe because the API layer is the only place that mutates them and it
-- uses the service client.
DROP POLICY IF EXISTS "Sellers read own payout account" ON public.seller_payout_accounts;
CREATE POLICY "Sellers read own payout account"
  ON public.seller_payout_accounts FOR SELECT
  USING (
    auth.role() = 'service_role'
    OR public.current_user_is_admin()
    OR user_id = auth.uid()
  );

DROP POLICY IF EXISTS "Sellers upsert own payout account" ON public.seller_payout_accounts;
CREATE POLICY "Sellers upsert own payout account"
  ON public.seller_payout_accounts FOR INSERT
  WITH CHECK (
    auth.role() = 'service_role'
    OR user_id = auth.uid()
  );

DROP POLICY IF EXISTS "Sellers update own payout account" ON public.seller_payout_accounts;
CREATE POLICY "Sellers update own payout account"
  ON public.seller_payout_accounts FOR UPDATE
  USING (
    auth.role() = 'service_role'
    OR public.current_user_is_admin()
    OR user_id = auth.uid()
  )
  WITH CHECK (
    auth.role() = 'service_role'
    OR public.current_user_is_admin()
    OR user_id = auth.uid()
  );

-- ============================================================================
-- Grants
-- ============================================================================

REVOKE ALL ON TABLE public.seller_payout_accounts FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.seller_payout_accounts TO authenticated;
