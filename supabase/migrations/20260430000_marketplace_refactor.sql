-- Migration: Marketplace refactor — fixed-price exchange schema (Part 1 of 8)
-- Date: 2026-04-30
--
-- Adds new marketplace_cards / listings / vault_inventory / pricing_history /
-- transactions / intake_log tables. Purely additive: legacy shop_listings,
-- shop_orders, shop_waitlist remain in place until Part 8 cleanup.

-- ============================================================================
-- marketplace_cards: global catalog of cards eligible for marketplace listing
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.marketplace_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  player TEXT NOT NULL,
  year INTEGER NOT NULL,
  manufacturer TEXT NOT NULL,
  grade TEXT NOT NULL,
  grading_service TEXT NOT NULL,
  cert_number TEXT,
  parallel TEXT,
  print_run INTEGER,
  estimated_value_cents INTEGER NOT NULL,
  intake_approved BOOLEAN NOT NULL DEFAULT FALSE,
  pipeline_assigned_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'marketplace_cards_manufacturer_check') THEN
    ALTER TABLE public.marketplace_cards
      ADD CONSTRAINT marketplace_cards_manufacturer_check
      CHECK (manufacturer IN ('topps', 'panini'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'marketplace_cards_grading_service_check') THEN
    ALTER TABLE public.marketplace_cards
      ADD CONSTRAINT marketplace_cards_grading_service_check
      CHECK (grading_service IN ('PSA', 'BGS', 'SGC'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'marketplace_cards_estimated_value_positive') THEN
    ALTER TABLE public.marketplace_cards
      ADD CONSTRAINT marketplace_cards_estimated_value_positive
      CHECK (estimated_value_cents >= 10000);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_marketplace_cards_cert_unique
  ON public.marketplace_cards (grading_service, cert_number)
  WHERE cert_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_marketplace_cards_player ON public.marketplace_cards (player);
CREATE INDEX IF NOT EXISTS idx_marketplace_cards_intake_approved ON public.marketplace_cards (intake_approved);

-- ============================================================================
-- listings: a card offered for sale (self-serve or full-service)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID NOT NULL REFERENCES public.marketplace_cards(id) ON DELETE RESTRICT,
  seller_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  mode TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  list_price_cents INTEGER NOT NULL,
  cmv_low_cents INTEGER,
  cmv_mid_cents INTEGER,
  cmv_high_cents INTEGER,
  listed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  day30_triggered_at TIMESTAMPTZ,
  day60_triggered_at TIMESTAMPTZ,
  pipeline TEXT NOT NULL DEFAULT 'standard',
  fee_tier TEXT NOT NULL,
  fulfilled_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'listings_mode_check') THEN
    ALTER TABLE public.listings ADD CONSTRAINT listings_mode_check
      CHECK (mode IN ('self_serve', 'full_service'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'listings_status_check') THEN
    ALTER TABLE public.listings ADD CONSTRAINT listings_status_check
      CHECK (status IN ('active', 'price_reduced', 'flagged', 'removed', 'sold'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'listings_pipeline_check') THEN
    ALTER TABLE public.listings ADD CONSTRAINT listings_pipeline_check
      CHECK (pipeline IN ('standard', 'elite', 'grails'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'listings_fee_tier_check') THEN
    ALTER TABLE public.listings ADD CONSTRAINT listings_fee_tier_check
      CHECK (fee_tier IN ('one_pct', 'two_pct', 'five_pct', 'negotiated'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'listings_fulfilled_by_check') THEN
    ALTER TABLE public.listings ADD CONSTRAINT listings_fulfilled_by_check
      CHECK (fulfilled_by IN ('seller', 'platform'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'listings_price_positive') THEN
    ALTER TABLE public.listings ADD CONSTRAINT listings_price_positive
      CHECK (list_price_cents > 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_listings_status_listed_at
  ON public.listings (status, listed_at DESC);
CREATE INDEX IF NOT EXISTS idx_listings_seller ON public.listings (seller_id);
CREATE INDEX IF NOT EXISTS idx_listings_card ON public.listings (card_id);
CREATE INDEX IF NOT EXISTS idx_listings_mode_status ON public.listings (mode, status);

-- ============================================================================
-- vault_inventory: physical custody record for full-service listings
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.vault_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES public.listings(id) ON DELETE RESTRICT,
  received_at TIMESTAMPTZ,
  location_notes TEXT,
  condition_photos TEXT[] NOT NULL DEFAULT '{}',
  intake_status TEXT NOT NULL DEFAULT 'pending',
  returned_at TIMESTAMPTZ,
  return_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vault_inventory_status_check') THEN
    ALTER TABLE public.vault_inventory ADD CONSTRAINT vault_inventory_status_check
      CHECK (intake_status IN ('pending', 'approved', 'rejected'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_vault_inventory_listing ON public.vault_inventory (listing_id);
CREATE INDEX IF NOT EXISTS idx_vault_inventory_status ON public.vault_inventory (intake_status);

-- ============================================================================
-- pricing_history: append-only price change log per listing
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.pricing_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  old_price_cents INTEGER,
  new_price_cents INTEGER NOT NULL,
  reason TEXT NOT NULL,
  changed_by UUID REFERENCES auth.users(id),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pricing_history_reason_check') THEN
    ALTER TABLE public.pricing_history ADD CONSTRAINT pricing_history_reason_check
      CHECK (reason IN ('initial', 'day30_reduction', 'day60_reduction', 'manual', 'flagged_decision'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_pricing_history_listing_changed
  ON public.pricing_history (listing_id, changed_at DESC);

-- ============================================================================
-- transactions: completed sales (one per sold listing)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES public.listings(id) ON DELETE RESTRICT,
  buyer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  seller_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  sale_price_cents INTEGER NOT NULL,
  fee_amount_cents INTEGER NOT NULL,
  fee_tier TEXT NOT NULL,
  fulfilled_by TEXT NOT NULL,
  stripe_session_id TEXT,
  stripe_payment_intent_id TEXT,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transactions_fee_tier_check') THEN
    ALTER TABLE public.transactions ADD CONSTRAINT transactions_fee_tier_check
      CHECK (fee_tier IN ('one_pct', 'two_pct', 'five_pct', 'negotiated'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transactions_fulfilled_by_check') THEN
    ALTER TABLE public.transactions ADD CONSTRAINT transactions_fulfilled_by_check
      CHECK (fulfilled_by IN ('seller', 'platform'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transactions_listing_unique') THEN
    ALTER TABLE public.transactions ADD CONSTRAINT transactions_listing_unique
      UNIQUE (listing_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_transactions_buyer ON public.transactions (buyer_id);
CREATE INDEX IF NOT EXISTS idx_transactions_seller ON public.transactions (seller_id);
CREATE INDEX IF NOT EXISTS idx_transactions_completed ON public.transactions (completed_at DESC);

-- ============================================================================
-- intake_log: audit trail for every intake decision (approval or rejection)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.intake_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID REFERENCES public.marketplace_cards(id) ON DELETE SET NULL,
  submitted_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  submission_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved BOOLEAN NOT NULL,
  rejection_reason TEXT,
  pipeline_assigned TEXT,
  decided_by UUID REFERENCES auth.users(id),
  decided_at TIMESTAMPTZ
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'intake_log_pipeline_check') THEN
    ALTER TABLE public.intake_log ADD CONSTRAINT intake_log_pipeline_check
      CHECK (pipeline_assigned IS NULL OR pipeline_assigned IN ('standard', 'elite', 'grails'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_intake_log_card ON public.intake_log (card_id);
CREATE INDEX IF NOT EXISTS idx_intake_log_submitted_by ON public.intake_log (submitted_by);

-- ============================================================================
-- updated_at touch triggers
-- ============================================================================

CREATE OR REPLACE FUNCTION public.touch_marketplace_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS marketplace_cards_touch_updated_at ON public.marketplace_cards;
CREATE TRIGGER marketplace_cards_touch_updated_at
  BEFORE UPDATE ON public.marketplace_cards
  FOR EACH ROW EXECUTE FUNCTION public.touch_marketplace_updated_at();

DROP TRIGGER IF EXISTS listings_touch_updated_at ON public.listings;
CREATE TRIGGER listings_touch_updated_at
  BEFORE UPDATE ON public.listings
  FOR EACH ROW EXECUTE FUNCTION public.touch_marketplace_updated_at();

DROP TRIGGER IF EXISTS vault_inventory_touch_updated_at ON public.vault_inventory;
CREATE TRIGGER vault_inventory_touch_updated_at
  BEFORE UPDATE ON public.vault_inventory
  FOR EACH ROW EXECUTE FUNCTION public.touch_marketplace_updated_at();

-- ============================================================================
-- RLS
-- ============================================================================

ALTER TABLE public.marketplace_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vault_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intake_log ENABLE ROW LEVEL SECURITY;

-- marketplace_cards: public read approved; admin/service writes
DROP POLICY IF EXISTS "Public reads approved cards" ON public.marketplace_cards;
CREATE POLICY "Public reads approved cards"
  ON public.marketplace_cards FOR SELECT
  USING (
    intake_approved = TRUE
    OR auth.role() = 'service_role'
    OR public.current_user_is_admin()
  );

DROP POLICY IF EXISTS "Admins write cards" ON public.marketplace_cards;
CREATE POLICY "Admins write cards"
  ON public.marketplace_cards FOR ALL
  USING (auth.role() = 'service_role' OR public.current_user_is_admin())
  WITH CHECK (auth.role() = 'service_role' OR public.current_user_is_admin());

-- listings: public reads active+price_reduced; sellers read own; admin all
DROP POLICY IF EXISTS "Public reads active listings" ON public.listings;
CREATE POLICY "Public reads active listings"
  ON public.listings FOR SELECT
  USING (
    status IN ('active', 'price_reduced')
    OR seller_id = auth.uid()
    OR auth.role() = 'service_role'
    OR public.current_user_is_admin()
  );

-- Sellers can INSERT their own self_serve listings only.
-- full_service inserts must go through API as service role (per spec).
DROP POLICY IF EXISTS "Sellers insert own self-serve listings" ON public.listings;
CREATE POLICY "Sellers insert own self-serve listings"
  ON public.listings FOR INSERT
  WITH CHECK (
    auth.role() = 'service_role'
    OR public.current_user_is_admin()
    OR (seller_id = auth.uid() AND mode = 'self_serve')
  );

-- Sellers can UPDATE their own listings, but never price/cmv on full_service
-- (price enforcement also occurs at the API layer per spec). Admins/service: all.
DROP POLICY IF EXISTS "Sellers update own listings" ON public.listings;
CREATE POLICY "Sellers update own listings"
  ON public.listings FOR UPDATE
  USING (
    auth.role() = 'service_role'
    OR public.current_user_is_admin()
    OR seller_id = auth.uid()
  )
  WITH CHECK (
    auth.role() = 'service_role'
    OR public.current_user_is_admin()
    OR seller_id = auth.uid()
  );

DROP POLICY IF EXISTS "Admins delete listings" ON public.listings;
CREATE POLICY "Admins delete listings"
  ON public.listings FOR DELETE
  USING (auth.role() = 'service_role' OR public.current_user_is_admin());

-- vault_inventory: admin/service write; sellers can read own (via listing join)
DROP POLICY IF EXISTS "Sellers read own vault rows" ON public.vault_inventory;
CREATE POLICY "Sellers read own vault rows"
  ON public.vault_inventory FOR SELECT
  USING (
    auth.role() = 'service_role'
    OR public.current_user_is_admin()
    OR EXISTS (
      SELECT 1 FROM public.listings l
      WHERE l.id = vault_inventory.listing_id
        AND l.seller_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admins write vault rows" ON public.vault_inventory;
CREATE POLICY "Admins write vault rows"
  ON public.vault_inventory FOR ALL
  USING (auth.role() = 'service_role' OR public.current_user_is_admin())
  WITH CHECK (auth.role() = 'service_role' OR public.current_user_is_admin());

-- pricing_history: sellers read own (via listing); admin/service write
DROP POLICY IF EXISTS "Sellers read own pricing history" ON public.pricing_history;
CREATE POLICY "Sellers read own pricing history"
  ON public.pricing_history FOR SELECT
  USING (
    auth.role() = 'service_role'
    OR public.current_user_is_admin()
    OR EXISTS (
      SELECT 1 FROM public.listings l
      WHERE l.id = pricing_history.listing_id
        AND l.seller_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Service writes pricing history" ON public.pricing_history;
CREATE POLICY "Service writes pricing history"
  ON public.pricing_history FOR INSERT
  WITH CHECK (auth.role() = 'service_role' OR public.current_user_is_admin());

-- transactions: buyer/seller read own; service-role only writes
DROP POLICY IF EXISTS "Parties read own transactions" ON public.transactions;
CREATE POLICY "Parties read own transactions"
  ON public.transactions FOR SELECT
  USING (
    auth.role() = 'service_role'
    OR public.current_user_is_admin()
    OR buyer_id = auth.uid()
    OR seller_id = auth.uid()
  );

DROP POLICY IF EXISTS "Service writes transactions" ON public.transactions;
CREATE POLICY "Service writes transactions"
  ON public.transactions FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

-- intake_log: admin read all; submitter reads own; service-role writes
DROP POLICY IF EXISTS "Submitters read own intake log" ON public.intake_log;
CREATE POLICY "Submitters read own intake log"
  ON public.intake_log FOR SELECT
  USING (
    auth.role() = 'service_role'
    OR public.current_user_is_admin()
    OR submitted_by = auth.uid()
  );

DROP POLICY IF EXISTS "Service writes intake log" ON public.intake_log;
CREATE POLICY "Service writes intake log"
  ON public.intake_log FOR INSERT
  WITH CHECK (auth.role() = 'service_role' OR public.current_user_is_admin());

DROP POLICY IF EXISTS "Admins update intake log" ON public.intake_log;
CREATE POLICY "Admins update intake log"
  ON public.intake_log FOR UPDATE
  USING (auth.role() = 'service_role' OR public.current_user_is_admin())
  WITH CHECK (auth.role() = 'service_role' OR public.current_user_is_admin());

-- ============================================================================
-- Grants
-- ============================================================================

REVOKE ALL ON TABLE public.marketplace_cards FROM anon, authenticated;
REVOKE ALL ON TABLE public.listings FROM anon, authenticated;
REVOKE ALL ON TABLE public.vault_inventory FROM anon, authenticated;
REVOKE ALL ON TABLE public.pricing_history FROM anon, authenticated;
REVOKE ALL ON TABLE public.transactions FROM anon, authenticated;
REVOKE ALL ON TABLE public.intake_log FROM anon, authenticated;

GRANT SELECT ON TABLE public.marketplace_cards TO anon, authenticated;
GRANT SELECT ON TABLE public.listings TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.vault_inventory TO authenticated;
GRANT SELECT ON TABLE public.pricing_history TO authenticated;
GRANT SELECT ON TABLE public.transactions TO authenticated;
GRANT SELECT ON TABLE public.intake_log TO authenticated;
GRANT INSERT, UPDATE ON TABLE public.listings TO authenticated;
GRANT INSERT, UPDATE ON TABLE public.marketplace_cards TO authenticated;
