-- Migration: Business cash on hand — append-only cash ledger.
-- Date: 2026-06-18
--
-- Tracks the liquid cash a business holds. The current balance is *derived* as
-- SUM(amount_cents) over non-deleted rows, so it can never drift out of sync.
--   amount_cents > 0  → cash in  (sale proceeds, cash received in a trade, deposit)
--   amount_cents < 0  → cash out (cash paid in a trade, withdrawal, purchase)
-- Manual entries (opening_balance / adjustment) are user-driven; sale/trade rows
-- are written automatically when those events are recorded and reversed (soft
-- deleted) when the source sale/trade is undone or deleted.

CREATE TABLE IF NOT EXISTS public.business_cash_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_account_id uuid NOT NULL,
  amount_cents integer NOT NULL,
  kind text NOT NULL DEFAULT 'adjustment'
    CHECK (kind IN ('opening_balance', 'adjustment', 'sale', 'trade', 'purchase')),
  -- When the row mirrors another ledger event, these point back to it so the
  -- cash impact can be reversed atomically with the source.
  source_type text CHECK (source_type IN ('sale', 'trade')),
  source_id uuid,
  note text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Primary read path: latest cash movements for an account.
CREATE INDEX IF NOT EXISTS idx_business_cash_tx_account_occurred
  ON public.business_cash_transactions (business_account_id, occurred_at DESC)
  WHERE is_deleted = false;

-- Reverse-by-source lookups (undo / delete a sale or trade).
CREATE INDEX IF NOT EXISTS idx_business_cash_tx_source
  ON public.business_cash_transactions (source_type, source_id)
  WHERE is_deleted = false;

-- updated_at trigger (reuse the shared helper used by other business tables).
DROP TRIGGER IF EXISTS update_business_cash_transactions_updated_at
  ON public.business_cash_transactions;
CREATE TRIGGER update_business_cash_transactions_updated_at
  BEFORE UPDATE ON public.business_cash_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- RLS — mirror business_ledger_actions: a personal workspace uses the user's own
-- UUID as business_account_id, team workspaces gate on membership/role.
ALTER TABLE public.business_cash_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can read cash transactions"
  ON public.business_cash_transactions;
CREATE POLICY "Members can read cash transactions"
  ON public.business_cash_transactions FOR SELECT
  USING (
    user_id = auth.uid()
    OR public.is_business_member(business_account_id, auth.uid())
  );

DROP POLICY IF EXISTS "Members can insert cash transactions"
  ON public.business_cash_transactions;
CREATE POLICY "Members can insert cash transactions"
  ON public.business_cash_transactions FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND (
      business_account_id = auth.uid()
      OR public.has_business_role(
        business_account_id, auth.uid(), ARRAY['owner', 'manager', 'employee']
      )
    )
  );

DROP POLICY IF EXISTS "Members can update cash transactions"
  ON public.business_cash_transactions;
CREATE POLICY "Members can update cash transactions"
  ON public.business_cash_transactions FOR UPDATE
  USING (
    user_id = auth.uid()
    OR public.has_business_role(business_account_id, auth.uid(), ARRAY['owner', 'manager'])
  )
  WITH CHECK (
    user_id = auth.uid()
    OR public.has_business_role(business_account_id, auth.uid(), ARRAY['owner', 'manager'])
  );
