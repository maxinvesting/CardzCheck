-- Migration: Grade Probability Engine training scaffold
-- Created: 2026-03-05

ALTER TABLE public.grade_estimator_runs
  ADD COLUMN IF NOT EXISTS actual_grade_psa TEXT,
  ADD COLUMN IF NOT EXISTS model_version_used TEXT,
  ADD COLUMN IF NOT EXISTS feature_version_used TEXT;

CREATE TABLE IF NOT EXISTS public.grade_scan_features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id UUID NOT NULL REFERENCES public.grade_estimator_runs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feature_version TEXT NOT NULL,
  features_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT grade_scan_features_feature_version_not_blank CHECK (length(trim(feature_version)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_grade_scan_features_scan_id
  ON public.grade_scan_features (scan_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_grade_scan_features_user_id
  ON public.grade_scan_features (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_grade_scan_features_version
  ON public.grade_scan_features (feature_version, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_grade_scan_features_scan_version
  ON public.grade_scan_features (scan_id, feature_version);

CREATE TABLE IF NOT EXISTS public.grade_scan_labels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id UUID NOT NULL REFERENCES public.grade_estimator_runs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  grader TEXT NOT NULL CHECK (grader IN ('psa', 'bgs', 'sgc', 'tag', 'other')),
  label_text TEXT NOT NULL,
  label_grade_numeric NUMERIC NULL,
  evidence_url TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT grade_scan_labels_label_text_not_blank CHECK (length(trim(label_text)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_grade_scan_labels_scan_grader
  ON public.grade_scan_labels (scan_id, grader);

CREATE INDEX IF NOT EXISTS idx_grade_scan_labels_user_created
  ON public.grade_scan_labels (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.grade_model_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_key TEXT NOT NULL,
  version TEXT NOT NULL,
  feature_version TEXT NOT NULL,
  model_type TEXT NOT NULL CHECK (model_type IN ('logreg', 'xgboost', 'gbrt', 'isotonic', 'platt', 'rules')),
  model_json JSONB NOT NULL,
  metrics_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT grade_model_versions_model_key_not_blank CHECK (length(trim(model_key)) > 0),
  CONSTRAINT grade_model_versions_version_not_blank CHECK (length(trim(version)) > 0),
  CONSTRAINT grade_model_versions_feature_version_not_blank CHECK (length(trim(feature_version)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_grade_model_versions_model_key_version
  ON public.grade_model_versions (model_key, version);

CREATE UNIQUE INDEX IF NOT EXISTS idx_grade_model_versions_one_active_per_key
  ON public.grade_model_versions (model_key)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_grade_model_versions_active
  ON public.grade_model_versions (model_key, is_active, created_at DESC);

CREATE OR REPLACE FUNCTION public.current_user_is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.app_role IN ('admin', 'owner')
  );
$$;

REVOKE ALL ON FUNCTION public.current_user_is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_is_admin() TO authenticated;

ALTER TABLE public.grade_scan_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grade_scan_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grade_model_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own grade scan features" ON public.grade_scan_features;
DROP POLICY IF EXISTS "Users can view own grade scan features" ON public.grade_scan_features;
CREATE POLICY "Users can view own grade scan features"
  ON public.grade_scan_features FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create own grade scan features" ON public.grade_scan_features;
DROP POLICY IF EXISTS "Users can create own grade scan features" ON public.grade_scan_features;
CREATE POLICY "Users can create own grade scan features"
  ON public.grade_scan_features FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own grade scan features" ON public.grade_scan_features;
DROP POLICY IF EXISTS "Users can delete own grade scan features" ON public.grade_scan_features;
CREATE POLICY "Users can delete own grade scan features"
  ON public.grade_scan_features FOR DELETE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own grade scan labels" ON public.grade_scan_labels;
DROP POLICY IF EXISTS "Users can view own grade scan labels" ON public.grade_scan_labels;
CREATE POLICY "Users can view own grade scan labels"
  ON public.grade_scan_labels FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create own grade scan labels" ON public.grade_scan_labels;
DROP POLICY IF EXISTS "Users can create own grade scan labels" ON public.grade_scan_labels;
CREATE POLICY "Users can create own grade scan labels"
  ON public.grade_scan_labels FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own grade scan labels" ON public.grade_scan_labels;
DROP POLICY IF EXISTS "Users can update own grade scan labels" ON public.grade_scan_labels;
CREATE POLICY "Users can update own grade scan labels"
  ON public.grade_scan_labels FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own grade scan labels" ON public.grade_scan_labels;
DROP POLICY IF EXISTS "Users can delete own grade scan labels" ON public.grade_scan_labels;
CREATE POLICY "Users can delete own grade scan labels"
  ON public.grade_scan_labels FOR DELETE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view active grade model versions" ON public.grade_model_versions;
DROP POLICY IF EXISTS "Users can view active grade model versions" ON public.grade_model_versions;
CREATE POLICY "Users can view active grade model versions"
  ON public.grade_model_versions FOR SELECT
  USING (is_active = TRUE OR auth.role() = 'service_role' OR public.current_user_is_admin());

DROP POLICY IF EXISTS "Only admin or service can insert grade model versions" ON public.grade_model_versions;
DROP POLICY IF EXISTS "Only admin or service can insert grade model versions" ON public.grade_model_versions;
CREATE POLICY "Only admin or service can insert grade model versions"
  ON public.grade_model_versions FOR INSERT
  WITH CHECK (auth.role() = 'service_role' OR public.current_user_is_admin());

DROP POLICY IF EXISTS "Only admin or service can update grade model versions" ON public.grade_model_versions;
DROP POLICY IF EXISTS "Only admin or service can update grade model versions" ON public.grade_model_versions;
CREATE POLICY "Only admin or service can update grade model versions"
  ON public.grade_model_versions FOR UPDATE
  USING (auth.role() = 'service_role' OR public.current_user_is_admin())
  WITH CHECK (auth.role() = 'service_role' OR public.current_user_is_admin());

DROP POLICY IF EXISTS "Only admin or service can delete grade model versions" ON public.grade_model_versions;
DROP POLICY IF EXISTS "Only admin or service can delete grade model versions" ON public.grade_model_versions;
CREATE POLICY "Only admin or service can delete grade model versions"
  ON public.grade_model_versions FOR DELETE
  USING (auth.role() = 'service_role' OR public.current_user_is_admin());

GRANT SELECT, INSERT, DELETE ON TABLE public.grade_scan_features TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.grade_scan_labels TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.grade_model_versions TO authenticated;
