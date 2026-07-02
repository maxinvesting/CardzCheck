-- Mock grading submission builder / order tracker.
-- Self-contained, no AI grade prediction: user plans a grading submission by
-- picking cards from their ledger, choosing a grading company, entering the
-- per-card cost + estimated turnaround, an estimated graded value (for
-- risk/reward), and tracks the order status over its lifecycle.
--
-- One row per order. The card line items live in the `data` JSONB payload so
-- the whole order syncs as a single document — no separate items table needed.

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS grading_mock_orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- 'personal' (collection ledger) or 'business' (business inventory ledger)
  scope TEXT NOT NULL DEFAULT 'personal',
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  -- Full order document: grading company, turnaround, per-card cost, shipping,
  -- and the array of card line items with cost basis + estimated graded value.
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  CONSTRAINT grading_mock_orders_scope_valid CHECK (scope IN ('personal', 'business')),
  CONSTRAINT grading_mock_orders_status_valid CHECK (
    status IN ('draft', 'submitted', 'grading', 'returned', 'completed', 'canceled')
  )
);

CREATE INDEX IF NOT EXISTS idx_grading_mock_orders_user_created
  ON grading_mock_orders(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_grading_mock_orders_user_scope
  ON grading_mock_orders(user_id, scope);

DROP TRIGGER IF EXISTS update_grading_mock_orders_updated_at ON grading_mock_orders;
CREATE TRIGGER update_grading_mock_orders_updated_at
  BEFORE UPDATE ON grading_mock_orders
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE grading_mock_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own mock grading orders" ON grading_mock_orders;
CREATE POLICY "Users can view own mock grading orders"
  ON grading_mock_orders FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create own mock grading orders" ON grading_mock_orders;
CREATE POLICY "Users can create own mock grading orders"
  ON grading_mock_orders FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own mock grading orders" ON grading_mock_orders;
CREATE POLICY "Users can update own mock grading orders"
  ON grading_mock_orders FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own mock grading orders" ON grading_mock_orders;
CREATE POLICY "Users can delete own mock grading orders"
  ON grading_mock_orders FOR DELETE
  USING (auth.uid() = user_id);
