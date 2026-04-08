-- Fix mark-as-sold: two root causes blocked sale inserts
--
-- 1. inventory_item_id FK pointed to collection_items instead of business_inventory_items,
--    causing every sale tied to an inventory item to fail with a FK violation.
--
-- 2. Legacy NOT NULL columns (sale_date, sale_price_cents) had no defaults, so
--    new-schema inserts (which don't supply those columns) always failed.

-- Fix 1: Retarget FK to the correct table
ALTER TABLE public.business_sales
  DROP CONSTRAINT IF EXISTS business_sales_inventory_item_id_fkey;

ALTER TABLE public.business_sales
  ADD CONSTRAINT business_sales_inventory_item_id_fkey
  FOREIGN KEY (inventory_item_id)
  REFERENCES public.business_inventory_items(id)
  ON DELETE SET NULL;

-- Fix 2: Give legacy columns safe defaults so new-schema inserts succeed
ALTER TABLE public.business_sales
  ALTER COLUMN sale_date        SET DEFAULT CURRENT_DATE,
  ALTER COLUMN sale_price_cents SET DEFAULT 0;

-- Fix 3: Extend sync trigger to backfill legacy columns from new columns
CREATE OR REPLACE FUNCTION public.sync_business_sales_owner()
RETURNS trigger AS $$
BEGIN
  -- Sync owner fields
  NEW.business_id := COALESCE(NEW.business_id, NEW.user_id, auth.uid());
  NEW.user_id     := COALESCE(NEW.user_id, NEW.business_id);
  -- Backfill legacy columns so their NOT NULL constraints are always satisfied
  NEW.sale_date          := COALESCE(NEW.sale_date, (NEW.sold_at AT TIME ZONE 'UTC')::date, CURRENT_DATE);
  NEW.sale_price_cents   := COALESCE(NEW.sale_price_cents, NEW.sold_price_cents, 0);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
