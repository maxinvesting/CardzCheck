-- Migration: Persist undoable business ledger actions.
-- Date: 2026-06-05

CREATE TABLE IF NOT EXISTS public.business_ledger_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_account_id uuid NOT NULL,
  action_type text NOT NULL,
  label text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_undone boolean NOT NULL DEFAULT false,
  undone_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT business_ledger_actions_action_type_check
    CHECK (action_type IN (
      'inventory_create',
      'inventory_bulk_create',
      'inventory_update',
      'inventory_bulk_update',
      'inventory_delete',
      'sale_create',
      'trade_create'
    ))
);

CREATE INDEX IF NOT EXISTS idx_business_ledger_actions_latest
  ON public.business_ledger_actions (business_account_id, created_at DESC)
  WHERE is_undone = false;

ALTER TABLE public.business_ledger_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can read ledger actions" ON public.business_ledger_actions;
CREATE POLICY "Members can read ledger actions"
  ON public.business_ledger_actions FOR SELECT
  USING (
    user_id = auth.uid()
    OR public.is_business_member(business_account_id, auth.uid())
  );

DROP POLICY IF EXISTS "Members can insert ledger actions" ON public.business_ledger_actions;
CREATE POLICY "Members can insert ledger actions"
  ON public.business_ledger_actions FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND (
      business_account_id = auth.uid()
      OR public.has_business_role(business_account_id, auth.uid(), ARRAY['owner', 'manager', 'employee'])
    )
  );

DROP POLICY IF EXISTS "Members can update ledger actions" ON public.business_ledger_actions;
CREATE POLICY "Members can update ledger actions"
  ON public.business_ledger_actions FOR UPDATE
  USING (
    user_id = auth.uid()
    OR public.has_business_role(business_account_id, auth.uid(), ARRAY['owner', 'manager'])
  )
  WITH CHECK (
    user_id = auth.uid()
    OR public.has_business_role(business_account_id, auth.uid(), ARRAY['owner', 'manager'])
  );
