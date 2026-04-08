-- Migration: Add search_text + trigram search for cards
-- Date: 2026-02-03

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Normalize search text (lowercase, strip punctuation, collapse whitespace)
CREATE OR REPLACE FUNCTION public.normalize_card_search_text(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT trim(regexp_replace(lower(coalesce(input, '')), '[^a-z0-9/]+', ' ', 'g'));
$$;

ALTER TABLE public.cards
ADD COLUMN IF NOT EXISTS search_text text;

-- Backfill existing rows
UPDATE public.cards
SET search_text = public.normalize_card_search_text(
  concat_ws(' ', year, brand, set_name, player_name, variant, grader, grade, card_number)
)
WHERE search_text IS NULL OR search_text = '';

-- Keep search_text updated on insert/update
CREATE OR REPLACE FUNCTION public.cards_set_search_text()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.search_text := public.normalize_card_search_text(
    concat_ws(' ', NEW.year, NEW.brand, NEW.set_name, NEW.player_name, NEW.variant, NEW.grader, NEW.grade, NEW.card_number)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cards_set_search_text ON public.cards;
CREATE TRIGGER cards_set_search_text
  BEFORE INSERT OR UPDATE ON public.cards
  FOR EACH ROW
  EXECUTE FUNCTION public.cards_set_search_text();

CREATE INDEX IF NOT EXISTS cards_search_text_trgm_idx
  ON public.cards
  USING gin (search_text gin_trgm_ops);

-- RPC for ranked candidate retrieval
CREATE OR REPLACE FUNCTION public.search_cards(
  query_text text,
  result_limit int DEFAULT 200
)
RETURNS TABLE (
  id uuid,
  year text,
  brand text,
  set_name text,
  player_name text,
  variant text,
  grader text,
  grade text,
  card_number text,
  search_text text,
  similarity real
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    id,
    year,
    brand,
    set_name,
    player_name,
    variant,
    grader,
    grade,
    card_number,
    search_text,
    similarity(search_text, query_text) AS similarity
  FROM public.cards
  WHERE search_text % query_text
  ORDER BY similarity DESC
  LIMIT LEAST(result_limit, 500);
$$;
