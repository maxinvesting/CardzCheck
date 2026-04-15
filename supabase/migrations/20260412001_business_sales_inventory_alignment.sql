-- Align business ledger inventory storage with the unified collection_items table.
--
-- Why this exists:
-- 1. The app records business inventory in collection_items (item_kind = 'inventory').
-- 2. business_sales.inventory_item_id was later re-pointed back to business_inventory_items,
--    which breaks sale creation for inventory rows that only exist in collection_items.
-- 3. Some inventory rows also predate business_account_id being set on collection_items,
--    which prevents business-ledger sale lookups from resolving the item.

-- Ensure unified inventory rows can carry a business account association.
ALTER TABLE public.collection_items
  ADD COLUMN IF NOT EXISTS business_account_id uuid
  REFERENCES public.business_accounts(id)
  ON DELETE CASCADE;

-- Backfill business account ownership for business inventory rows.
UPDATE public.collection_items ci
SET business_account_id = ba.id
FROM public.business_accounts ba
WHERE ci.business_account_id IS NULL
  AND COALESCE(ci.item_kind, 'owned') = 'inventory'
  AND ba.owner_user_id = ci.user_id;

UPDATE public.collection_items ci
SET business_account_id = public.current_business_account_id(ci.user_id)
WHERE ci.business_account_id IS NULL
  AND COALESCE(ci.item_kind, 'owned') = 'inventory'
  AND public.current_business_account_id(ci.user_id) IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_collection_items_business_account_kind_status
  ON public.collection_items (business_account_id, item_kind, status);

-- If legacy FK drift left sales pointing at ids absent from collection_items,
-- seed minimal placeholder inventory rows so the corrected FK can be applied.
INSERT INTO public.collection_items (
  id,
  user_id,
  business_account_id,
  item_kind,
  title,
  player_name,
  quantity,
  acquisition_type,
  cost_basis_total_cents,
  condition_status,
  channel,
  status,
  created_at,
  updated_at
)
SELECT
  bs.inventory_item_id,
  COALESCE(account_by_id.owner_user_id, account_by_owner.owner_user_id, bs.business_id, bs.user_id),
  COALESCE(bs.business_account_id, account_by_id.id, account_by_owner.id),
  'inventory',
  'Migrated sold item',
  'Migrated sold item',
  1,
  'other',
  COALESCE(bs.cogs_cents, 0),
  'raw',
  COALESCE(NULLIF(bs.channel, ''), 'other'),
  'sold',
  COALESCE(bs.created_at, NOW()),
  COALESCE(bs.updated_at, bs.created_at, NOW())
FROM public.business_sales bs
LEFT JOIN public.collection_items ci
  ON ci.id = bs.inventory_item_id
LEFT JOIN public.business_accounts account_by_id
  ON account_by_id.id = bs.business_account_id
LEFT JOIN public.business_accounts account_by_owner
  ON account_by_owner.owner_user_id = COALESCE(bs.business_id, bs.user_id)
WHERE bs.inventory_item_id IS NOT NULL
  AND ci.id IS NULL;

-- Correct the sales FK to point at unified inventory rows.
ALTER TABLE public.business_sales
  ALTER COLUMN inventory_item_id DROP NOT NULL;

ALTER TABLE public.business_sales
  DROP CONSTRAINT IF EXISTS business_sales_inventory_item_id_fkey;

ALTER TABLE public.business_sales
  ADD CONSTRAINT business_sales_inventory_item_id_fkey
  FOREIGN KEY (inventory_item_id)
  REFERENCES public.collection_items(id)
  ON DELETE SET NULL;

-- Keep legacy required columns populated for mixed-schema environments.
ALTER TABLE public.business_sales
  ALTER COLUMN sale_date SET DEFAULT CURRENT_DATE,
  ALTER COLUMN sale_price_cents SET DEFAULT 0;

CREATE OR REPLACE FUNCTION public.sync_business_sales_owner()
RETURNS trigger AS $$
BEGIN
  NEW.business_id := COALESCE(NEW.business_id, NEW.user_id, auth.uid());
  NEW.user_id := COALESCE(NEW.user_id, NEW.business_id);
  NEW.sale_date := COALESCE(
    NEW.sale_date,
    (NEW.sold_at AT TIME ZONE 'UTC')::date,
    CURRENT_DATE
  );
  NEW.sale_price_cents := COALESCE(NEW.sale_price_cents, NEW.sold_price_cents, 0);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
