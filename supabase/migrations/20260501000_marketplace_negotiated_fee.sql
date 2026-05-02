-- Migration: Add negotiated_fee_cents column to listings for elite-tier fees.
-- Date: 2026-05-01
--
-- Elite-pipeline listings use fee_tier='negotiated' with an admin-set fee
-- amount. Stored on the listing so the checkout API can inject it into
-- Stripe session metadata, where the webhook (lib/marketplace/fee-resolver)
-- reads it back and writes the final fee_amount_cents to transactions.

ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS negotiated_fee_cents INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'listings_negotiated_fee_check'
  ) THEN
    ALTER TABLE public.listings
      ADD CONSTRAINT listings_negotiated_fee_check
      CHECK (
        negotiated_fee_cents IS NULL
        OR negotiated_fee_cents >= 0
      );
  END IF;
END $$;
