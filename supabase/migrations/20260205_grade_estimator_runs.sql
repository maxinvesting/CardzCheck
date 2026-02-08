-- Migration: Create grade_estimator_runs table for grade probability engine history
-- Created: 2026-02-05

CREATE TABLE IF NOT EXISTS grade_estimator_runs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id TEXT NOT NULL,
  card JSONB NOT NULL,
  estimate JSONB NOT NULL,
  post_grading_value JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_grade_estimator_runs_user_job
  ON grade_estimator_runs(user_id, job_id);

CREATE INDEX IF NOT EXISTS idx_grade_estimator_runs_user_created
  ON grade_estimator_runs(user_id, created_at DESC);

ALTER TABLE grade_estimator_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own grade estimator runs" ON grade_estimator_runs;
CREATE POLICY "Users can view own grade estimator runs"
  ON grade_estimator_runs FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create own grade estimator runs" ON grade_estimator_runs;
CREATE POLICY "Users can create own grade estimator runs"
  ON grade_estimator_runs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own grade estimator runs" ON grade_estimator_runs;
CREATE POLICY "Users can update own grade estimator runs"
  ON grade_estimator_runs FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own grade estimator runs" ON grade_estimator_runs;
CREATE POLICY "Users can delete own grade estimator runs"
  ON grade_estimator_runs FOR DELETE
  USING (auth.uid() = user_id);

-- Function to clean up old runs and keep only last 25 per user
CREATE OR REPLACE FUNCTION cleanup_old_grade_estimator_runs()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM grade_estimator_runs
  WHERE id IN (
    SELECT id FROM grade_estimator_runs
    WHERE user_id = NEW.user_id
    ORDER BY created_at DESC
    OFFSET 25
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS cleanup_old_grade_estimator_runs_trigger ON grade_estimator_runs;
CREATE TRIGGER cleanup_old_grade_estimator_runs_trigger
  AFTER INSERT ON grade_estimator_runs
  FOR EACH ROW
  EXECUTE FUNCTION cleanup_old_grade_estimator_runs();
