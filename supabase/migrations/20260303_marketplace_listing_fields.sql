-- Migration: Marketplace listing fields (title/condition/publish_state/inventory link)
-- Date: 2026-03-03

ALTER TABLE IF EXISTS public.shop_listings
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS inventory_item_id uuid,
  ADD COLUMN IF NOT EXISTS condition text NOT NULL DEFAULT 'graded',
  ADD COLUMN IF NOT EXISTS publish_state text NOT NULL DEFAULT 'published';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'shop_listings_condition_check'
      AND conrelid = 'public.shop_listings'::regclass
  ) THEN
    ALTER TABLE public.shop_listings
      ADD CONSTRAINT shop_listings_condition_check
      CHECK (condition IN ('raw', 'graded', 'sealed'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'shop_listings_publish_state_check'
      AND conrelid = 'public.shop_listings'::regclass
  ) THEN
    ALTER TABLE public.shop_listings
      ADD CONSTRAINT shop_listings_publish_state_check
      CHECK (publish_state IN ('draft', 'published'));
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.business_inventory_items') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conname = 'shop_listings_inventory_item_id_fkey'
         AND conrelid = 'public.shop_listings'::regclass
     ) THEN
    ALTER TABLE public.shop_listings
      ADD CONSTRAINT shop_listings_inventory_item_id_fkey
      FOREIGN KEY (inventory_item_id)
      REFERENCES public.business_inventory_items(id)
      ON DELETE SET NULL;
  END IF;
END $$;

UPDATE public.shop_listings
SET condition = CASE
  WHEN lower(coalesce(grade, '')) LIKE '%raw%'
    OR lower(coalesce(grade, '')) LIKE '%ungraded%'
    THEN 'raw'
  ELSE 'graded'
END
WHERE condition IS NULL OR condition NOT IN ('raw', 'graded', 'sealed');

UPDATE public.shop_listings
SET publish_state = 'draft'
WHERE status = 'delisted'
  AND publish_state = 'published';

CREATE INDEX IF NOT EXISTS idx_shop_listings_publish_status_created
  ON public.shop_listings (publish_state, status, created_at DESC);

ALTER TABLE IF EXISTS public.shop_listings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read active listings" ON public.shop_listings;
CREATE POLICY "Public can read active listings"
  ON public.shop_listings FOR SELECT
  USING (status = 'active' AND publish_state = 'published');
