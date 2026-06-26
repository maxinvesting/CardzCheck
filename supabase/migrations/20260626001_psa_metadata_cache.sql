-- PSA cert METADATA cache.
--
-- The image lookup (GetImagesByCertNumber) is already cached in
-- public.psa_cert_cache. The metadata lookup (GetByCertNumber) — the call
-- behind the "Add graded card (PSA)" modal — was NOT cached and hit PSA live
-- on every submit, draining the (very small) daily API quota and surfacing a
-- vague "PSA lookup unavailable" error once the quota was spent.
--
-- A PSA cert's metadata is immutable (subject/year/set/grade never change for a
-- given cert number), so a permanent cache is safe: each unique cert costs
-- exactly one PSA call, ever, then is served locally forever after.
--
-- Service-role-only access (mirrors psa_cert_cache): RLS enabled, no policies.

CREATE TABLE IF NOT EXISTS public.psa_cert_metadata_cache (
  cert_number text PRIMARY KEY,
  player_name text,
  year text,
  set_name text,
  card_number text,
  grade text,
  grading_company text,
  parallel_type text,
  payload jsonb,
  fetched_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.psa_cert_metadata_cache ENABLE ROW LEVEL SECURITY;
