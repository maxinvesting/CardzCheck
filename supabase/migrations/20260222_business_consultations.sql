-- Migration: Create business_consultations table for persistent consultant history
-- Created: 2026-02-22

CREATE TABLE IF NOT EXISTS business_consultations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'New Consultation',
  prompt TEXT NOT NULL,
  response TEXT NOT NULL,
  context_summary JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_business_consultations_user_updated
  ON business_consultations(user_id, updated_at DESC);
DROP TRIGGER IF EXISTS update_business_consultations_updated_at ON business_consultations;
CREATE TRIGGER update_business_consultations_updated_at
  BEFORE UPDATE ON business_consultations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE business_consultations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own business consultations" ON business_consultations;
CREATE POLICY "Users can view own business consultations"
  ON business_consultations FOR SELECT
  USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can create own business consultations" ON business_consultations;
CREATE POLICY "Users can create own business consultations"
  ON business_consultations FOR INSERT
  WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own business consultations" ON business_consultations;
CREATE POLICY "Users can update own business consultations"
  ON business_consultations FOR UPDATE
  USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own business consultations" ON business_consultations;
CREATE POLICY "Users can delete own business consultations"
  ON business_consultations FOR DELETE
  USING (auth.uid() = user_id);
