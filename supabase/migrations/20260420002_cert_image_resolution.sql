-- Async cert image resolution jobs and cache for PSA/BGS/SGC/CGC.

ALTER TYPE public.card_image_source ADD VALUE IF NOT EXISTS 'bgs';
ALTER TYPE public.card_image_source ADD VALUE IF NOT EXISTS 'sgc';
ALTER TYPE public.card_image_source ADD VALUE IF NOT EXISTS 'cgc';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'cert_image_status'
  ) THEN
    CREATE TYPE public.cert_image_status AS ENUM ('queued', 'running', 'resolved', 'no_image', 'failed');
  END IF;
END $$;

ALTER TABLE public.collection_items
  ADD COLUMN IF NOT EXISTS cert_image_status public.cert_image_status,
  ADD COLUMN IF NOT EXISTS cert_image_last_error text;

ALTER TABLE public.business_inventory_items
  ADD COLUMN IF NOT EXISTS cert_image_status public.cert_image_status,
  ADD COLUMN IF NOT EXISTS cert_image_last_error text;

ALTER TABLE public.cards
  ADD COLUMN IF NOT EXISTS cert_image_status public.cert_image_status,
  ADD COLUMN IF NOT EXISTS cert_image_last_error text;

CREATE TABLE IF NOT EXISTS public.cert_image_resolution_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.collection_items(id) ON DELETE CASCADE,
  grader text NOT NULL CHECK (grader IN ('PSA', 'BGS', 'SGC', 'CGC')),
  cert_number text NOT NULL,
  status public.cert_image_status NOT NULL DEFAULT 'queued',
  attempts integer NOT NULL DEFAULT 0,
  resolved_image_url text,
  source_page_url text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_cert_image_resolution_jobs_user_id
  ON public.cert_image_resolution_jobs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cert_image_resolution_jobs_lookup
  ON public.cert_image_resolution_jobs (grader, cert_number, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.cert_image_cache (
  grader text NOT NULL CHECK (grader IN ('PSA', 'BGS', 'SGC', 'CGC')),
  cert_number text NOT NULL,
  image_url text,
  source_page_url text,
  status text NOT NULL CHECK (status IN ('resolved', 'no_image', 'failed')),
  last_error text,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (grader, cert_number)
);

CREATE INDEX IF NOT EXISTS idx_cert_image_cache_expires_at
  ON public.cert_image_cache (expires_at);

ALTER TABLE public.cert_image_resolution_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cert_image_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own cert image jobs" ON public.cert_image_resolution_jobs;
CREATE POLICY "Users can view own cert image jobs"
  ON public.cert_image_resolution_jobs
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own cert image jobs" ON public.cert_image_resolution_jobs;
CREATE POLICY "Users can insert own cert image jobs"
  ON public.cert_image_resolution_jobs
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

UPDATE public.collection_items
SET cert_image_status = CASE
  WHEN image_source::text IN ('psa', 'bgs', 'sgc', 'cgc') AND NULLIF(BTRIM(image_url), '') IS NOT NULL
    THEN 'resolved'::public.cert_image_status
  WHEN NULLIF(BTRIM(COALESCE(psa_cert_number, cert_number)), '') IS NOT NULL
    THEN 'no_image'::public.cert_image_status
  ELSE cert_image_status
END
WHERE cert_image_status IS NULL;

UPDATE public.business_inventory_items
SET cert_image_status = CASE
  WHEN image_source::text IN ('psa', 'bgs', 'sgc', 'cgc') AND NULLIF(BTRIM(image_url), '') IS NOT NULL
    THEN 'resolved'::public.cert_image_status
  WHEN NULLIF(BTRIM(COALESCE(psa_cert_number, cert_number)), '') IS NOT NULL
    THEN 'no_image'::public.cert_image_status
  ELSE cert_image_status
END
WHERE cert_image_status IS NULL;

UPDATE public.cards
SET cert_image_status = CASE
  WHEN image_source::text IN ('psa', 'bgs', 'sgc', 'cgc') AND NULLIF(BTRIM(image_url), '') IS NOT NULL
    THEN 'resolved'::public.cert_image_status
  WHEN NULLIF(BTRIM(psa_cert_number), '') IS NOT NULL
    THEN 'no_image'::public.cert_image_status
  ELSE cert_image_status
END
WHERE cert_image_status IS NULL;
