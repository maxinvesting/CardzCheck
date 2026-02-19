-- Migration: Business tier – inventory tracking + sales ledger
-- Date: 2026-02-19

-- ============================================
-- 1. BUSINESS INVENTORY ITEMS
-- ============================================
CREATE TABLE IF NOT EXISTS public.business_inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  card_id text,
  title text NOT NULL,
  quantity int NOT NULL DEFAULT 1,
  acquisition_date date,
  acquisition_type text NOT NULL DEFAULT 'buy'
    CHECK (acquisition_type IN ('buy','trade','rip','consignment','other')),
  cost_basis_total_cents int NOT NULL DEFAULT 0,
  tax_cents int NOT NULL DEFAULT 0,
  shipping_cents int NOT NULL DEFAULT 0,
  fees_paid_cents int NOT NULL DEFAULT 0,
  condition_status text NOT NULL DEFAULT 'raw'
    CHECK (condition_status IN ('raw','graded')),
  grading_company text,
  grade text,
  cert_number text,
  location text,
  channel text NOT NULL DEFAULT 'ebay'
    CHECK (channel IN ('ebay','whatnot','instagram','show','local','other')),
  status text NOT NULL DEFAULT 'unlisted'
    CHECK (status IN ('unlisted','listed','pending_sale','sold','returned')),
  list_price_cents int,
  current_market_value_cents int,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_business_inventory_user
  ON public.business_inventory_items (user_id);
CREATE INDEX IF NOT EXISTS idx_business_inventory_status
  ON public.business_inventory_items (user_id, status);

-- ============================================
-- 2. BUSINESS SALES
-- ============================================
CREATE TABLE IF NOT EXISTS public.business_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  inventory_item_id uuid NOT NULL REFERENCES public.business_inventory_items(id) ON DELETE CASCADE,
  sale_date date NOT NULL,
  sale_price_cents int NOT NULL,
  platform_fees_cents int NOT NULL DEFAULT 0,
  shipping_charged_cents int NOT NULL DEFAULT 0,
  shipping_paid_cents int NOT NULL DEFAULT 0,
  other_costs_cents int NOT NULL DEFAULT 0,
  net_proceeds_cents int NOT NULL DEFAULT 0,
  profit_cents int NOT NULL DEFAULT 0,
  order_id text,
  buyer_handle text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_business_sales_user
  ON public.business_sales (user_id);
CREATE INDEX IF NOT EXISTS idx_business_sales_item
  ON public.business_sales (inventory_item_id);
CREATE INDEX IF NOT EXISTS idx_business_sales_date
  ON public.business_sales (user_id, sale_date);

-- ============================================
-- 3. UPDATED_AT TRIGGER FUNCTION (shared)
-- ============================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_business_inventory_updated_at ON public.business_inventory_items;
CREATE TRIGGER trg_business_inventory_updated_at
  BEFORE UPDATE ON public.business_inventory_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_business_sales_updated_at ON public.business_sales;
CREATE TRIGGER trg_business_sales_updated_at
  BEFORE UPDATE ON public.business_sales
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================
-- 4. AUTO-COMPUTE net_proceeds + profit ON INSERT/UPDATE
-- ============================================
CREATE OR REPLACE FUNCTION public.compute_sale_financials()
RETURNS trigger AS $$
DECLARE
  item_cost int;
BEGIN
  -- net = sale_price - platform_fees - shipping_paid - other_costs + shipping_charged
  NEW.net_proceeds_cents :=
    NEW.sale_price_cents
    - NEW.platform_fees_cents
    - NEW.shipping_paid_cents
    - NEW.other_costs_cents
    + NEW.shipping_charged_cents;

  -- For MVP, allocate full cost basis per unit (qty = 1 assumption)
  SELECT COALESCE(cost_basis_total_cents, 0) INTO item_cost
    FROM public.business_inventory_items
    WHERE id = NEW.inventory_item_id;

  NEW.profit_cents := NEW.net_proceeds_cents - item_cost;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_business_sales_compute ON public.business_sales;
CREATE TRIGGER trg_business_sales_compute
  BEFORE INSERT OR UPDATE ON public.business_sales
  FOR EACH ROW EXECUTE FUNCTION public.compute_sale_financials();

-- ============================================
-- 5. RLS POLICIES
-- ============================================

-- business_inventory_items
ALTER TABLE public.business_inventory_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own inventory" ON public.business_inventory_items;
CREATE POLICY "Users can read own inventory"
  ON public.business_inventory_items FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own inventory" ON public.business_inventory_items;
CREATE POLICY "Users can insert own inventory"
  ON public.business_inventory_items FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own inventory" ON public.business_inventory_items;
CREATE POLICY "Users can update own inventory"
  ON public.business_inventory_items FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own inventory" ON public.business_inventory_items;
CREATE POLICY "Users can delete own inventory"
  ON public.business_inventory_items FOR DELETE
  USING (auth.uid() = user_id);

-- business_sales
ALTER TABLE public.business_sales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own sales" ON public.business_sales;
CREATE POLICY "Users can read own sales"
  ON public.business_sales FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own sales" ON public.business_sales;
CREATE POLICY "Users can insert own sales"
  ON public.business_sales FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own sales" ON public.business_sales;
CREATE POLICY "Users can update own sales"
  ON public.business_sales FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own sales" ON public.business_sales;
CREATE POLICY "Users can delete own sales"
  ON public.business_sales FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- 6. ADD 'business' TO SUBSCRIPTIONS TIER CHECK (if constraint exists)
-- ============================================
DO $$
BEGIN
  -- Update the tier column to accept 'business' if there is a check constraint
  -- If subscription table exists and has a check constraint on tier, alter it
  IF to_regclass('public.subscriptions') IS NOT NULL THEN
    -- Drop existing check constraint if it exists (name may vary)
    BEGIN
      ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_tier_check;
    EXCEPTION WHEN undefined_object THEN NULL;
    END;
    -- The tier column is text, so 'business' is already valid.
    -- We don't enforce a CHECK on tier to keep it flexible for future tiers.
  END IF;
END $$;
