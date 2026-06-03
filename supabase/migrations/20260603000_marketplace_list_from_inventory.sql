-- Migration: List from inventory + self-serve auto-markdown + eBay co-list
-- Date: 2026-06-03
--
-- Enables listing a card on the CardzCheck marketplace directly from the
-- business ledger / card profile. Relaxes the intake-era constraints on
-- marketplace_cards so that any graded inventory card can be bridged into a
-- listing, adds provenance columns, per-listing seller-configurable automated
-- price lowering for self-serve listings, and an optional eBay co-list price.

-- ============================================================================
-- marketplace_cards: relax intake constraints + add provenance
-- ============================================================================

ALTER TABLE public.marketplace_cards
  DROP CONSTRAINT IF EXISTS marketplace_cards_manufacturer_check;
ALTER TABLE public.marketplace_cards
  DROP CONSTRAINT IF EXISTS marketplace_cards_grading_service_check;

-- Lower the minimum estimated value floor ($100 -> $1) so lower-value graded
-- cards from a ledger can still be listed.
ALTER TABLE public.marketplace_cards
  DROP CONSTRAINT IF EXISTS marketplace_cards_estimated_value_positive;
ALTER TABLE public.marketplace_cards
  ADD CONSTRAINT marketplace_cards_estimated_value_positive
  CHECK (estimated_value_cents >= 100);

ALTER TABLE public.marketplace_cards
  ADD COLUMN IF NOT EXISTS image_url TEXT,
  ADD COLUMN IF NOT EXISTS card_number TEXT,
  ADD COLUMN IF NOT EXISTS source_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_inventory_item_id UUID;

-- ============================================================================
-- listings: provenance + self-serve auto-markdown + eBay co-list
-- ============================================================================

ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS source_inventory_item_id UUID,
  ADD COLUMN IF NOT EXISTS auto_markdown_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS auto_markdown_pct NUMERIC,
  ADD COLUMN IF NOT EXISTS auto_markdown_interval_days INTEGER,
  ADD COLUMN IF NOT EXISTS auto_markdown_floor_cents INTEGER,
  ADD COLUMN IF NOT EXISTS last_markdown_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ebay_colist_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ebay_colist_price_cents INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'listings_auto_markdown_pct_range') THEN
    ALTER TABLE public.listings ADD CONSTRAINT listings_auto_markdown_pct_range
      CHECK (auto_markdown_pct IS NULL OR (auto_markdown_pct > 0 AND auto_markdown_pct < 1));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'listings_auto_markdown_interval_positive') THEN
    ALTER TABLE public.listings ADD CONSTRAINT listings_auto_markdown_interval_positive
      CHECK (auto_markdown_interval_days IS NULL OR auto_markdown_interval_days > 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_listings_auto_markdown
  ON public.listings (mode, auto_markdown_enabled, status)
  WHERE auto_markdown_enabled = TRUE;

-- ============================================================================
-- pricing_history: allow the auto_markdown reason
-- ============================================================================

ALTER TABLE public.pricing_history
  DROP CONSTRAINT IF EXISTS pricing_history_reason_check;
ALTER TABLE public.pricing_history
  ADD CONSTRAINT pricing_history_reason_check
  CHECK (reason IN ('initial', 'day30_reduction', 'day60_reduction', 'manual', 'flagged_decision', 'auto_markdown'));
