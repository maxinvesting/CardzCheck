-- Migration: Upgrade business_sales to event-based transactions with soft delete + KPI aggregation
-- Date: 2026-02-26

ALTER TABLE public.business_sales
  ADD COLUMN IF NOT EXISTS business_id uuid,
  ADD COLUMN IF NOT EXISTS channel text,
  ADD COLUMN IF NOT EXISTS sold_at timestamptz,
  ADD COLUMN IF NOT EXISTS sold_price_cents int,
  ADD COLUMN IF NOT EXISTS shipping_cost_cents int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_cents int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_payout_cents int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cogs_cents int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS external_order_id text,
  ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false;

UPDATE public.business_sales
SET business_id = COALESCE(business_id, user_id)
WHERE business_id IS NULL;

UPDATE public.business_sales
SET sold_at = COALESCE(sold_at, sale_date::timestamptz, created_at, now())
WHERE sold_at IS NULL;

UPDATE public.business_sales
SET sold_price_cents = COALESCE(sold_price_cents, sale_price_cents, 0)
WHERE sold_price_cents IS NULL;

UPDATE public.business_sales
SET channel = COALESCE(NULLIF(channel, ''), 'other')
WHERE channel IS NULL OR channel = '';

UPDATE public.business_sales
SET shipping_cost_cents = COALESCE(shipping_cost_cents, shipping_paid_cents, 0);

UPDATE public.business_sales
SET external_order_id = COALESCE(external_order_id, order_id)
WHERE external_order_id IS NULL;

UPDATE public.business_sales
SET net_payout_cents = COALESCE(
  net_payout_cents,
  net_proceeds_cents,
  COALESCE(sold_price_cents, sale_price_cents, 0)
    + COALESCE(shipping_charged_cents, 0)
    - COALESCE(platform_fees_cents, 0)
    - COALESCE(shipping_cost_cents, shipping_paid_cents, 0)
    - COALESCE(tax_cents, 0)
);

UPDATE public.business_sales bs
SET cogs_cents = COALESCE(ci.cost_basis_total_cents, 0)
FROM public.business_inventory_items ci
WHERE bs.inventory_item_id = ci.id
  AND bs.cogs_cents = 0;

UPDATE public.business_sales
SET profit_cents = COALESCE(net_payout_cents, 0) - COALESCE(cogs_cents, 0);

ALTER TABLE public.business_sales
  ALTER COLUMN business_id SET NOT NULL,
  ALTER COLUMN channel SET NOT NULL,
  ALTER COLUMN sold_at SET NOT NULL,
  ALTER COLUMN sold_price_cents SET NOT NULL,
  ALTER COLUMN sold_at SET DEFAULT now(),
  ALTER COLUMN inventory_item_id DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'business_sales_business_id_fkey'
  ) THEN
    ALTER TABLE public.business_sales
      ADD CONSTRAINT business_sales_business_id_fkey
      FOREIGN KEY (business_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'business_sales_channel_check'
  ) THEN
    ALTER TABLE public.business_sales
      ADD CONSTRAINT business_sales_channel_check
      CHECK (channel IN ('ebay', 'whatnot', 'local', 'instagram', 'show', 'other'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_business_sales_business_sold_at_desc
  ON public.business_sales (business_id, sold_at DESC)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_business_sales_inventory_item
  ON public.business_sales (inventory_item_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_business_sales_business_external_order
  ON public.business_sales (business_id, external_order_id)
  WHERE external_order_id IS NOT NULL AND external_order_id <> '' AND is_deleted = false;

DROP TRIGGER IF EXISTS trg_business_sales_compute ON public.business_sales;

CREATE OR REPLACE FUNCTION public.sync_business_sales_owner()
RETURNS trigger AS $$
BEGIN
  NEW.business_id := COALESCE(NEW.business_id, NEW.user_id, auth.uid());
  NEW.user_id := COALESCE(NEW.user_id, NEW.business_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_business_sales_owner_sync ON public.business_sales;
CREATE TRIGGER trg_business_sales_owner_sync
  BEFORE INSERT OR UPDATE ON public.business_sales
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_business_sales_owner();

ALTER TABLE public.business_sales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own sales" ON public.business_sales;
CREATE POLICY "Users can read own sales"
  ON public.business_sales FOR SELECT
  USING (auth.uid() = business_id);

DROP POLICY IF EXISTS "Users can insert own sales" ON public.business_sales;
CREATE POLICY "Users can insert own sales"
  ON public.business_sales FOR INSERT
  WITH CHECK (auth.uid() = business_id);

DROP POLICY IF EXISTS "Users can update own sales" ON public.business_sales;
CREATE POLICY "Users can update own sales"
  ON public.business_sales FOR UPDATE
  USING (auth.uid() = business_id)
  WITH CHECK (auth.uid() = business_id);

DROP POLICY IF EXISTS "Users can delete own sales" ON public.business_sales;
CREATE POLICY "Users can delete own sales"
  ON public.business_sales FOR DELETE
  USING (auth.uid() = business_id);

CREATE OR REPLACE FUNCTION public.get_business_kpis_agg(
  p_business_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
RETURNS TABLE (
  revenue_cents bigint,
  profit_cents bigint,
  sales_count bigint
)
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    COALESCE(SUM(COALESCE(sold_price_cents, 0) + COALESCE(shipping_charged_cents, 0)), 0)::bigint AS revenue_cents,
    COALESCE(SUM(COALESCE(profit_cents, 0)), 0)::bigint AS profit_cents,
    COUNT(*)::bigint AS sales_count
  FROM public.business_sales
  WHERE business_id = p_business_id
    AND is_deleted = false
    AND sold_at >= p_from
    AND sold_at < p_to;
$$;
