-- eBay Integration: accounts, listings, import jobs, and inventory item_id column
-- Migration: 20260304_ebay_integration.sql

-- ============================================================
-- 1. ebay_accounts — per-user OAuth tokens
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ebay_accounts (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ebay_user_id                TEXT,
  ebay_username               TEXT,
  access_token                TEXT NOT NULL,
  refresh_token               TEXT NOT NULL,
  access_token_expires_at     TIMESTAMPTZ NOT NULL,
  refresh_token_expires_at    TIMESTAMPTZ NOT NULL,
  scopes                      TEXT[] NOT NULL DEFAULT '{}',
  is_active                   BOOLEAN NOT NULL DEFAULT true,
  top_rated_seller            BOOLEAN DEFAULT false,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ebay_accounts_user_id_unique UNIQUE (user_id)
);
CREATE INDEX IF NOT EXISTS idx_ebay_accounts_user_id ON public.ebay_accounts (user_id);
ALTER TABLE public.ebay_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ebay_accounts_owner_select" ON public.ebay_accounts;
CREATE POLICY "ebay_accounts_owner_select"
  ON public.ebay_accounts FOR SELECT
  USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "ebay_accounts_owner_insert" ON public.ebay_accounts;
CREATE POLICY "ebay_accounts_owner_insert"
  ON public.ebay_accounts FOR INSERT
  WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "ebay_accounts_owner_update" ON public.ebay_accounts;
CREATE POLICY "ebay_accounts_owner_update"
  ON public.ebay_accounts FOR UPDATE
  USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "ebay_accounts_owner_delete" ON public.ebay_accounts;
CREATE POLICY "ebay_accounts_owner_delete"
  ON public.ebay_accounts FOR DELETE
  USING (auth.uid() = user_id);
-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.trg_ebay_accounts_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_ebay_accounts_updated_at ON public.ebay_accounts;
CREATE TRIGGER trg_ebay_accounts_updated_at
  BEFORE UPDATE ON public.ebay_accounts
  FOR EACH ROW EXECUTE FUNCTION public.trg_ebay_accounts_updated_at();
-- ============================================================
-- 2. ebay_listings — polymorphic inventory ↔ eBay listing map
-- ============================================================
-- Uses (inventory_source, inventory_source_id) tuple instead of a hard FK
-- so we can later swap inventory_source to 'collection_items' without
-- rewriting any eBay logic.

CREATE TABLE IF NOT EXISTS public.ebay_listings (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  inventory_source      TEXT NOT NULL DEFAULT 'business_inventory_items'
                          CHECK (inventory_source IN ('business_inventory_items', 'collection_items')),
  inventory_source_id   UUID NOT NULL,
  ebay_listing_id       TEXT NOT NULL,
  ebay_sku              TEXT,
  title                 TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active', 'ended', 'sold', 'error')),
  listed_price_cents    INT NOT NULL,
  ebay_category_id      TEXT,
  listing_url           TEXT,
  last_synced_at        TIMESTAMPTZ,
  error_message         TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ebay_listings_user_listing_unique UNIQUE (user_id, ebay_listing_id)
);
CREATE INDEX IF NOT EXISTS idx_ebay_listings_user_id
  ON public.ebay_listings (user_id);
CREATE INDEX IF NOT EXISTS idx_ebay_listings_inventory_source
  ON public.ebay_listings (inventory_source, inventory_source_id);
CREATE INDEX IF NOT EXISTS idx_ebay_listings_user_status
  ON public.ebay_listings (user_id, status);
ALTER TABLE public.ebay_listings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ebay_listings_owner_select" ON public.ebay_listings;
CREATE POLICY "ebay_listings_owner_select"
  ON public.ebay_listings FOR SELECT
  USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "ebay_listings_owner_insert" ON public.ebay_listings;
CREATE POLICY "ebay_listings_owner_insert"
  ON public.ebay_listings FOR INSERT
  WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "ebay_listings_owner_update" ON public.ebay_listings;
CREATE POLICY "ebay_listings_owner_update"
  ON public.ebay_listings FOR UPDATE
  USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "ebay_listings_owner_delete" ON public.ebay_listings;
CREATE POLICY "ebay_listings_owner_delete"
  ON public.ebay_listings FOR DELETE
  USING (auth.uid() = user_id);
CREATE OR REPLACE FUNCTION public.trg_ebay_listings_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_ebay_listings_updated_at ON public.ebay_listings;
CREATE TRIGGER trg_ebay_listings_updated_at
  BEFORE UPDATE ON public.ebay_listings
  FOR EACH ROW EXECUTE FUNCTION public.trg_ebay_listings_updated_at();
-- ============================================================
-- 3. ebay_import_jobs — async bulk import progress tracking
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ebay_import_jobs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_type          TEXT NOT NULL CHECK (job_type IN ('listings', 'sales')),
  status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  total_count       INT,
  processed_count   INT NOT NULL DEFAULT 0,
  error_message     TEXT,
  started_at        TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ebay_import_jobs_user_id
  ON public.ebay_import_jobs (user_id, created_at DESC);
ALTER TABLE public.ebay_import_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ebay_import_jobs_owner_select" ON public.ebay_import_jobs;
CREATE POLICY "ebay_import_jobs_owner_select"
  ON public.ebay_import_jobs FOR SELECT
  USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "ebay_import_jobs_owner_insert" ON public.ebay_import_jobs;
CREATE POLICY "ebay_import_jobs_owner_insert"
  ON public.ebay_import_jobs FOR INSERT
  WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "ebay_import_jobs_owner_update" ON public.ebay_import_jobs;
CREATE POLICY "ebay_import_jobs_owner_update"
  ON public.ebay_import_jobs FOR UPDATE
  USING (auth.uid() = user_id);
-- ============================================================
-- 4. business_inventory_items — add denormalized ebay_item_id
-- ============================================================
-- Denormalized for fast InventoryTable badge lookups without joining ebay_listings.
-- ebay_listings.ebay_listing_id is the authoritative record.

ALTER TABLE public.business_inventory_items
  ADD COLUMN IF NOT EXISTS ebay_item_id TEXT;
CREATE INDEX IF NOT EXISTS idx_business_inventory_items_ebay_item_id
  ON public.business_inventory_items (ebay_item_id)
  WHERE ebay_item_id IS NOT NULL;
