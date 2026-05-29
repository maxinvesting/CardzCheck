-- Migration: Per-inventory-item targets (goals/plans) with AI insight cache.
-- Date: 2026-05-27

CREATE TABLE IF NOT EXISTS public.business_card_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_account_id uuid NOT NULL,
  inventory_item_id uuid NOT NULL REFERENCES public.business_inventory_items(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('sell_price', 'flip_by', 'hold_until', 'custom')),
  description text NOT NULL,
  target_price_cents integer,
  target_date date,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'achieved', 'abandoned')),
  ai_insight text,
  ai_insight_at timestamptz,
  achieved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_business_card_targets_item
  ON public.business_card_targets (inventory_item_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_business_card_targets_account_status
  ON public.business_card_targets (business_account_id, status);

DROP TRIGGER IF EXISTS update_business_card_targets_updated_at ON public.business_card_targets;
CREATE TRIGGER update_business_card_targets_updated_at
  BEFORE UPDATE ON public.business_card_targets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.business_card_targets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own card targets" ON public.business_card_targets;
CREATE POLICY "Users can read own card targets"
  ON public.business_card_targets FOR SELECT
  USING (auth.uid() = user_id OR auth.uid() = business_account_id);

DROP POLICY IF EXISTS "Users can insert own card targets" ON public.business_card_targets;
CREATE POLICY "Users can insert own card targets"
  ON public.business_card_targets FOR INSERT
  WITH CHECK (auth.uid() = user_id OR auth.uid() = business_account_id);

DROP POLICY IF EXISTS "Users can update own card targets" ON public.business_card_targets;
CREATE POLICY "Users can update own card targets"
  ON public.business_card_targets FOR UPDATE
  USING (auth.uid() = user_id OR auth.uid() = business_account_id)
  WITH CHECK (auth.uid() = user_id OR auth.uid() = business_account_id);

DROP POLICY IF EXISTS "Users can delete own card targets" ON public.business_card_targets;
CREATE POLICY "Users can delete own card targets"
  ON public.business_card_targets FOR DELETE
  USING (auth.uid() = user_id OR auth.uid() = business_account_id);
