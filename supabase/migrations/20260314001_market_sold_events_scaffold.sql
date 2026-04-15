-- Item-level sold events scaffold for comps explainability and sold-first valuation.
-- This table does not replace existing snapshot tables yet.
-- It enables a safe migration path away from aggregate-only sold arrays.

CREATE TABLE IF NOT EXISTS public.market_sold_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL DEFAULT 'ebay',
  external_listing_id text,
  card_fingerprint text,
  listing_url text,
  image_url text,
  title_raw text NOT NULL,
  title_normalized text,
  sold_price_cents int NOT NULL CHECK (sold_price_cents > 0),
  sold_at timestamptz NOT NULL,
  player text,
  year text,
  brand text,
  set_name text,
  subset text,
  card_number text,
  parallel text,
  serial_number text,
  print_run text,
  autograph boolean,
  relic boolean,
  grading_company text,
  grade text,
  cert_number text,
  condition_type text,
  identity_confidence numeric,
  parse_version text,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT market_sold_events_identity_confidence_range
    CHECK (
      identity_confidence IS NULL
      OR (identity_confidence >= 0 AND identity_confidence <= 1)
    )
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_market_sold_events_source_external_sold_at
  ON public.market_sold_events(source, external_listing_id, sold_at)
  WHERE external_listing_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_market_sold_events_fingerprint_sold_at
  ON public.market_sold_events(card_fingerprint, sold_at DESC);
CREATE INDEX IF NOT EXISTS idx_market_sold_events_title_fts
  ON public.market_sold_events USING gin (to_tsvector('simple', COALESCE(title_normalized, title_raw)));
CREATE INDEX IF NOT EXISTS idx_market_sold_events_player_set_sold_at
  ON public.market_sold_events(player, set_name, sold_at DESC);
ALTER TABLE public.market_sold_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "market_sold_events_select" ON public.market_sold_events;
DROP POLICY IF EXISTS "market_sold_events_insert" ON public.market_sold_events;
DROP POLICY IF EXISTS "market_sold_events_update" ON public.market_sold_events;
DROP POLICY IF EXISTS "market_sold_events_delete" ON public.market_sold_events;
REVOKE ALL ON public.market_sold_events FROM anon, authenticated;
