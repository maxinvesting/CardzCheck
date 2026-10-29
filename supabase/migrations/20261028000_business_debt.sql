-- Migration: Business debt — append-only debt ledger.
-- Date: 2026-10-28
--
-- Tracks money the business owes. Like business_cash_transactions, the balance
-- is *derived* as SUM(amount_cents) over non-deleted rows:
--   amount_cents > 0  → debt increased (borrowed, bought on credit)
--   amount_cents < 0  → debt decreased (paid down)
-- All rows are manual entries (opening balance / adjustment).

CREATE TABLE IF NOT EXISTS public.business_debt_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_account_id uuid NOT NULL,
  amount_cents integer NOT NULL,
  kind text NOT NULL DEFAULT 'adjustment'
    CHECK (kind IN ('opening_balance', 'adjustment')),
  note text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_business_debt_tx_account_occurred
  ON public.business_debt_transactions (business_account_id, occurred_at DESC)
  WHERE is_deleted = false;

DROP TRIGGER IF EXISTS update_business_debt_transactions_updated_at
  ON public.business_debt_transactions;
CREATE TRIGGER update_business_debt_transactions_updated_at
  BEFORE UPDATE ON public.business_debt_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- RLS — mirrors business_cash_transactions.
ALTER TABLE public.business_debt_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can read debt transactions"
  ON public.business_debt_transactions;
CREATE POLICY "Members can read debt transactions"
  ON public.business_debt_transactions FOR SELECT
  USING (
    user_id = auth.uid()
    OR private.is_business_member(business_account_id, auth.uid())
  );

DROP POLICY IF EXISTS "Members can insert debt transactions"
  ON public.business_debt_transactions;
CREATE POLICY "Members can insert debt transactions"
  ON public.business_debt_transactions FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND (
      business_account_id = auth.uid()
      OR private.has_business_role(
        business_account_id, auth.uid(), ARRAY['owner', 'manager', 'employee']
      )
    )
  );

DROP POLICY IF EXISTS "Members can update debt transactions"
  ON public.business_debt_transactions;
CREATE POLICY "Members can update debt transactions"
  ON public.business_debt_transactions FOR UPDATE
  USING (
    user_id = auth.uid()
    OR private.has_business_role(business_account_id, auth.uid(), ARRAY['owner', 'manager'])
  )
  WITH CHECK (
    user_id = auth.uid()
    OR private.has_business_role(business_account_id, auth.uid(), ARRAY['owner', 'manager'])
  );
