-- Migration: Trade ledger — record card-for-card trades with cost-basis inheritance.
-- Date: 2026-04-23

-- 1) Add 'traded' to collection_items status CHECK constraint.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'collection_items_status_check'
  ) THEN
    ALTER TABLE public.collection_items
      DROP CONSTRAINT collection_items_status_check;
  END IF;

  ALTER TABLE public.collection_items
    ADD CONSTRAINT collection_items_status_check
    CHECK (status IN ('unlisted', 'listed', 'pending_sale', 'sold', 'returned', 'traded'));
END $$;

-- 2) business_trades — one row per trade event.
CREATE TABLE IF NOT EXISTS public.business_trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_account_id uuid NOT NULL,
  partner_name text,
  traded_at timestamptz NOT NULL DEFAULT now(),
  cash_paid_cents integer NOT NULL DEFAULT 0,
  cash_received_cents integer NOT NULL DEFAULT 0,
  outgoing_basis_cents integer NOT NULL DEFAULT 0,
  incoming_basis_cents integer NOT NULL DEFAULT 0,
  realized_gain_cents integer NOT NULL DEFAULT 0,
  notes text,
  is_deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_business_trades_account_traded_at
  ON public.business_trades (business_account_id, traded_at DESC)
  WHERE is_deleted = false;

-- 3) business_trade_items — line items per trade (incoming + outgoing).
CREATE TABLE IF NOT EXISTS public.business_trade_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id uuid NOT NULL REFERENCES public.business_trades(id) ON DELETE CASCADE,
  collection_item_id uuid NOT NULL REFERENCES public.collection_items(id) ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('out', 'in')),
  fair_value_cents integer,
  allocated_cost_basis_cents integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_business_trade_items_trade
  ON public.business_trade_items (trade_id);
CREATE INDEX IF NOT EXISTS idx_business_trade_items_collection_item
  ON public.business_trade_items (collection_item_id);

-- 4) updated_at trigger (reuse existing helper).
DROP TRIGGER IF EXISTS update_business_trades_updated_at ON public.business_trades;
CREATE TRIGGER update_business_trades_updated_at
  BEFORE UPDATE ON public.business_trades
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 5) RLS.
ALTER TABLE public.business_trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_trade_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own trades" ON public.business_trades;
CREATE POLICY "Users can read own trades"
  ON public.business_trades FOR SELECT
  USING (auth.uid() = user_id OR auth.uid() = business_account_id);

DROP POLICY IF EXISTS "Users can insert own trades" ON public.business_trades;
CREATE POLICY "Users can insert own trades"
  ON public.business_trades FOR INSERT
  WITH CHECK (auth.uid() = user_id OR auth.uid() = business_account_id);

DROP POLICY IF EXISTS "Users can update own trades" ON public.business_trades;
CREATE POLICY "Users can update own trades"
  ON public.business_trades FOR UPDATE
  USING (auth.uid() = user_id OR auth.uid() = business_account_id)
  WITH CHECK (auth.uid() = user_id OR auth.uid() = business_account_id);

DROP POLICY IF EXISTS "Users can delete own trades" ON public.business_trades;
CREATE POLICY "Users can delete own trades"
  ON public.business_trades FOR DELETE
  USING (auth.uid() = user_id OR auth.uid() = business_account_id);

DROP POLICY IF EXISTS "Users can read own trade items" ON public.business_trade_items;
CREATE POLICY "Users can read own trade items"
  ON public.business_trade_items FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.business_trades t
    WHERE t.id = business_trade_items.trade_id
      AND (auth.uid() = t.user_id OR auth.uid() = t.business_account_id)
  ));

DROP POLICY IF EXISTS "Users can insert own trade items" ON public.business_trade_items;
CREATE POLICY "Users can insert own trade items"
  ON public.business_trade_items FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.business_trades t
    WHERE t.id = business_trade_items.trade_id
      AND (auth.uid() = t.user_id OR auth.uid() = t.business_account_id)
  ));

DROP POLICY IF EXISTS "Users can update own trade items" ON public.business_trade_items;
CREATE POLICY "Users can update own trade items"
  ON public.business_trade_items FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.business_trades t
    WHERE t.id = business_trade_items.trade_id
      AND (auth.uid() = t.user_id OR auth.uid() = t.business_account_id)
  ));

DROP POLICY IF EXISTS "Users can delete own trade items" ON public.business_trade_items;
CREATE POLICY "Users can delete own trade items"
  ON public.business_trade_items FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.business_trades t
    WHERE t.id = business_trade_items.trade_id
      AND (auth.uid() = t.user_id OR auth.uid() = t.business_account_id)
  ));
