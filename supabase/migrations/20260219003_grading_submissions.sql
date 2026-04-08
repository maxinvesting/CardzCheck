-- Grade Probability Engine submission builder + tracking
-- Adds mock/actual grading submissions and per-card snapshots.

-- Shared updated_at trigger helper (idempotent).
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'grading_submission_mode') THEN
    CREATE TYPE grading_submission_mode AS ENUM ('mock', 'actual');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'grading_submission_grader') THEN
    CREATE TYPE grading_submission_grader AS ENUM ('psa');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'grading_submission_status') THEN
    CREATE TYPE grading_submission_status AS ENUM (
      'draft',
      'ready',
      'shipped',
      'arrived',
      'grading',
      'qa',
      'shipped_back',
      'received',
      'completed'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'grading_submission_source_type') THEN
    CREATE TYPE grading_submission_source_type AS ENUM ('collection', 'watchlist', 'manual');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS grading_submissions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  mode grading_submission_mode NOT NULL,
  grader grading_submission_grader NOT NULL DEFAULT 'psa',
  status grading_submission_status NOT NULL DEFAULT 'draft',
  psa_order_id TEXT,
  service_level TEXT,
  declared_value_cents INTEGER NOT NULL DEFAULT 0,
  shipping_cents INTEGER NOT NULL DEFAULT 0,
  insurance_cents INTEGER NOT NULL DEFAULT 0,
  fees_estimate_cents INTEGER NOT NULL DEFAULT 0,
  fees_actual_cents INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  CONSTRAINT grading_submissions_declared_value_non_negative CHECK (declared_value_cents >= 0),
  CONSTRAINT grading_submissions_shipping_non_negative CHECK (shipping_cents >= 0),
  CONSTRAINT grading_submissions_insurance_non_negative CHECK (insurance_cents >= 0),
  CONSTRAINT grading_submissions_fees_estimate_non_negative CHECK (fees_estimate_cents >= 0),
  CONSTRAINT grading_submissions_fees_actual_non_negative CHECK (fees_actual_cents IS NULL OR fees_actual_cents >= 0)
);

CREATE TABLE IF NOT EXISTS grading_submission_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  submission_id UUID NOT NULL REFERENCES grading_submissions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_type grading_submission_source_type NOT NULL,
  source_id TEXT,
  title TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  cost_basis_cents INTEGER,
  predicted_distribution JSONB NOT NULL DEFAULT '{}'::jsonb,
  target_grade TEXT,
  estimated_value_by_grade JSONB NOT NULL DEFAULT '{}'::jsonb,
  expected_value_cents INTEGER NOT NULL DEFAULT 0,
  break_even_grade TEXT,
  risk_flags TEXT[] NOT NULL DEFAULT '{}'::text[],
  actual_grade TEXT,
  cert_number TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  CONSTRAINT grading_submission_items_quantity_positive CHECK (quantity > 0),
  CONSTRAINT grading_submission_items_cost_basis_non_negative CHECK (cost_basis_cents IS NULL OR cost_basis_cents >= 0)
);

CREATE INDEX IF NOT EXISTS idx_grading_submissions_user_created
  ON grading_submissions(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_grading_submissions_user_status
  ON grading_submissions(user_id, status);

CREATE INDEX IF NOT EXISTS idx_grading_submission_items_submission
  ON grading_submission_items(submission_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_grading_submission_items_user
  ON grading_submission_items(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_grading_submission_items_source
  ON grading_submission_items(user_id, source_type, source_id);

DROP TRIGGER IF EXISTS update_grading_submissions_updated_at ON grading_submissions;
CREATE TRIGGER update_grading_submissions_updated_at
  BEFORE UPDATE ON grading_submissions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_grading_submission_items_updated_at ON grading_submission_items;
CREATE TRIGGER update_grading_submission_items_updated_at
  BEFORE UPDATE ON grading_submission_items
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE grading_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE grading_submission_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own grading submissions" ON grading_submissions;
CREATE POLICY "Users can view own grading submissions"
  ON grading_submissions FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create own grading submissions" ON grading_submissions;
CREATE POLICY "Users can create own grading submissions"
  ON grading_submissions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own grading submissions" ON grading_submissions;
CREATE POLICY "Users can update own grading submissions"
  ON grading_submissions FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own grading submissions" ON grading_submissions;
CREATE POLICY "Users can delete own grading submissions"
  ON grading_submissions FOR DELETE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own grading submission items" ON grading_submission_items;
CREATE POLICY "Users can view own grading submission items"
  ON grading_submission_items FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create own grading submission items" ON grading_submission_items;
CREATE POLICY "Users can create own grading submission items"
  ON grading_submission_items FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own grading submission items" ON grading_submission_items;
CREATE POLICY "Users can update own grading submission items"
  ON grading_submission_items FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own grading submission items" ON grading_submission_items;
CREATE POLICY "Users can delete own grading submission items"
  ON grading_submission_items FOR DELETE
  USING (auth.uid() = user_id);
