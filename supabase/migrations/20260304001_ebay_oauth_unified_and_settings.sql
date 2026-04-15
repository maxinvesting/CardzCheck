-- Migration: eBay OAuth user tokens, unified card DB fields, settings persistence
-- Date: 2026-03-04

-- ============================================================
-- 1. Unified card DB: add ebay_item_id to collection_items
-- ============================================================
ALTER TABLE public.collection_items
  ADD COLUMN IF NOT EXISTS ebay_item_id TEXT,
  ADD COLUMN IF NOT EXISTS ebay_listing_url TEXT;

CREATE INDEX IF NOT EXISTS idx_collection_items_ebay_item_id
  ON public.collection_items (user_id, ebay_item_id)
  WHERE ebay_item_id IS NOT NULL;

-- ============================================================
-- 2. Expand acquisition_type check to include all valid values
-- from both personal collection and business inventory.
-- The unified_item_kinds migration may have already done this
-- but we ensure idempotency.
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'collection_items_acquisition_type_check'
  ) THEN
    ALTER TABLE public.collection_items
      DROP CONSTRAINT collection_items_acquisition_type_check;
  END IF;
END $$;

ALTER TABLE public.collection_items
  ADD CONSTRAINT collection_items_acquisition_type_check
  CHECK (
    acquisition_type IS NULL OR acquisition_type IN (
      'pulled', 'bought', 'trade', 'gift', 'unknown',
      'buy', 'rip', 'consignment', 'other'
    )
  );

-- ============================================================
-- 3. eBay OAuth user tokens (stored server-side only)
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users'
      AND column_name = 'ebay_oauth_access_token'
  ) THEN
    ALTER TABLE public.users
      ADD COLUMN ebay_oauth_access_token TEXT,
      ADD COLUMN ebay_oauth_refresh_token TEXT,
      ADD COLUMN ebay_oauth_token_expires_at TIMESTAMPTZ,
      ADD COLUMN ebay_oauth_connected_username TEXT;
  END IF;
END $$;

-- ============================================================
-- 4. Last sync timestamps for eBay inventory and sales
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users'
      AND column_name = 'ebay_last_inventory_sync'
  ) THEN
    ALTER TABLE public.users
      ADD COLUMN ebay_last_inventory_sync TIMESTAMPTZ,
      ADD COLUMN ebay_last_sales_sync TIMESTAMPTZ;
  END IF;
END $$;

-- ============================================================
-- 5. eBay fee rate — persisted to DB (currently localStorage only)
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users'
      AND column_name = 'ebay_fee_rate'
  ) THEN
    ALTER TABLE public.users
      ADD COLUMN ebay_fee_rate TEXT NOT NULL DEFAULT 'standard';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'users_ebay_fee_rate_check'
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_ebay_fee_rate_check
      CHECK (ebay_fee_rate IN ('standard', 'top_rated_plus'));
  END IF;
END $$;

-- ============================================================
-- 6. Website URL field for users
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users'
      AND column_name = 'website_url'
  ) THEN
    ALTER TABLE public.users
      ADD COLUMN website_url TEXT;
  END IF;
END $$;

-- ============================================================
-- 7. Ensure collection_items RLS allows users to toggle item_kind
-- between 'owned' and 'inventory' on their own rows.
-- The existing policy "Users can update own items" covers this.
-- No additional policy needed — item_kind is just another column.
-- ============================================================

-- ============================================================
-- 8. Index to speed up grading submissions dashboard signal
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_grading_submissions_user_status
  ON public.grading_submissions (user_id, status)
  WHERE status NOT IN ('completed');
