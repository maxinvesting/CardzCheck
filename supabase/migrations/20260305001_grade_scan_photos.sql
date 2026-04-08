-- Migration: Persist grade scan photos (front/back/close-up tags) per estimator run
-- Created: 2026-03-05

ALTER TABLE grade_estimator_runs
  ADD COLUMN IF NOT EXISTS scan_photos JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS grade_scan_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id UUID NOT NULL REFERENCES grade_estimator_runs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (
    kind IN (
      'front',
      'back',
      'corner_tl',
      'corner_tr',
      'corner_bl',
      'corner_br',
      'edges',
      'surface',
      'other'
    )
  ),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_grade_scan_photos_scan_id
  ON grade_scan_photos(scan_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_grade_scan_photos_user_id
  ON grade_scan_photos(user_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_grade_scan_photos_scan_sort
  ON grade_scan_photos(scan_id, sort_order);

ALTER TABLE grade_scan_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own grade scan photos" ON grade_scan_photos;
CREATE POLICY "Users can view own grade scan photos"
  ON grade_scan_photos FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create own grade scan photos" ON grade_scan_photos;
CREATE POLICY "Users can create own grade scan photos"
  ON grade_scan_photos FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own grade scan photos" ON grade_scan_photos;
CREATE POLICY "Users can update own grade scan photos"
  ON grade_scan_photos FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own grade scan photos" ON grade_scan_photos;
CREATE POLICY "Users can delete own grade scan photos"
  ON grade_scan_photos FOR DELETE
  USING (auth.uid() = user_id);
