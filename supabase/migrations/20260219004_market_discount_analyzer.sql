-- Listings vs Sold Discount Analyzer
-- Stores active/sold snapshots, per-card discount factors, and aggregated market buckets.

CREATE TABLE IF NOT EXISTS public.market_price_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  card_fingerprint text NOT NULL,
  query_text text NOT NULL,
  source text NOT NULL DEFAULT 'ebay',
  snapshot_type text NOT NULL CHECK (snapshot_type IN ('active', 'sold')),
  observed_at timestamptz NOT NULL DEFAULT now(),
  prices_cents int[] NOT NULL DEFAULT '{}'::int[],
  sample_size int NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT market_price_snapshots_sample_size_non_negative CHECK (sample_size >= 0)
);

CREATE INDEX IF NOT EXISTS idx_market_price_snapshots_fingerprint_type_observed
  ON public.market_price_snapshots(card_fingerprint, snapshot_type, observed_at DESC);

CREATE INDEX IF NOT EXISTS idx_market_price_snapshots_observed
  ON public.market_price_snapshots(observed_at DESC);

CREATE INDEX IF NOT EXISTS idx_market_price_snapshots_query_text
  ON public.market_price_snapshots USING gin (to_tsvector('simple', query_text));

CREATE TABLE IF NOT EXISTS public.market_discount_factors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_fingerprint text NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT now(),
  listing_median_cents int,
  sold_median_cents int,
  listing_count int,
  sold_count int,
  discount_ratio numeric,
  discount_ratio_clipped numeric,
  iqr_listing int,
  iqr_sold int,
  outliers_removed_listing int NOT NULL DEFAULT 0,
  outliers_removed_sold int NOT NULL DEFAULT 0,
  confidence text NOT NULL CHECK (confidence IN ('low', 'medium', 'high')),
  bucket jsonb NOT NULL,
  notes text,
  CONSTRAINT market_discount_factors_listing_count_non_negative CHECK (listing_count IS NULL OR listing_count >= 0),
  CONSTRAINT market_discount_factors_sold_count_non_negative CHECK (sold_count IS NULL OR sold_count >= 0)
);

CREATE INDEX IF NOT EXISTS idx_market_discount_factors_fingerprint_computed
  ON public.market_discount_factors(card_fingerprint, computed_at DESC);

CREATE INDEX IF NOT EXISTS idx_market_discount_factors_bucket_gin
  ON public.market_discount_factors USING gin (bucket);

CREATE TABLE IF NOT EXISTS public.market_discount_buckets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  computed_at timestamptz NOT NULL DEFAULT now(),
  bucket jsonb NOT NULL UNIQUE,
  ratio_median numeric NOT NULL,
  ratio_p25 numeric,
  ratio_p75 numeric,
  n_cards int NOT NULL,
  n_samples int NOT NULL,
  confidence text NOT NULL CHECK (confidence IN ('low', 'medium', 'high')),
  CONSTRAINT market_discount_buckets_n_cards_positive CHECK (n_cards >= 0),
  CONSTRAINT market_discount_buckets_n_samples_positive CHECK (n_samples >= 0)
);

CREATE INDEX IF NOT EXISTS idx_market_discount_buckets_computed
  ON public.market_discount_buckets(computed_at DESC);

ALTER TABLE public.market_price_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_discount_factors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_discount_buckets ENABLE ROW LEVEL SECURITY;

-- Explicitly remove policies so these tables are server/service-role only.
DROP POLICY IF EXISTS "market_price_snapshots_select" ON public.market_price_snapshots;
DROP POLICY IF EXISTS "market_price_snapshots_insert" ON public.market_price_snapshots;
DROP POLICY IF EXISTS "market_price_snapshots_update" ON public.market_price_snapshots;
DROP POLICY IF EXISTS "market_price_snapshots_delete" ON public.market_price_snapshots;

DROP POLICY IF EXISTS "market_discount_factors_select" ON public.market_discount_factors;
DROP POLICY IF EXISTS "market_discount_factors_insert" ON public.market_discount_factors;
DROP POLICY IF EXISTS "market_discount_factors_update" ON public.market_discount_factors;
DROP POLICY IF EXISTS "market_discount_factors_delete" ON public.market_discount_factors;

DROP POLICY IF EXISTS "market_discount_buckets_select" ON public.market_discount_buckets;
DROP POLICY IF EXISTS "market_discount_buckets_insert" ON public.market_discount_buckets;
DROP POLICY IF EXISTS "market_discount_buckets_update" ON public.market_discount_buckets;
DROP POLICY IF EXISTS "market_discount_buckets_delete" ON public.market_discount_buckets;

REVOKE ALL ON public.market_price_snapshots FROM anon, authenticated;
REVOKE ALL ON public.market_discount_factors FROM anon, authenticated;
REVOKE ALL ON public.market_discount_buckets FROM anon, authenticated;
