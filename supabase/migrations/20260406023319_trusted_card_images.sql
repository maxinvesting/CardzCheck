-- Trusted card image system
-- Canonical source order: PSA cert image -> user upload -> clean fallback UI

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'card_image_source'
  ) THEN
    CREATE TYPE public.card_image_source AS ENUM ('psa', 'user', 'none');
  END IF;
END $$;

ALTER TABLE public.collection_items
  ADD COLUMN IF NOT EXISTS psa_cert_number text,
  ADD COLUMN IF NOT EXISTS image_source public.card_image_source NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS image_url text;

ALTER TABLE public.business_inventory_items
  ADD COLUMN IF NOT EXISTS psa_cert_number text,
  ADD COLUMN IF NOT EXISTS image_source public.card_image_source NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS image_url text;

ALTER TABLE public.cards
  ADD COLUMN IF NOT EXISTS psa_cert_number text,
  ADD COLUMN IF NOT EXISTS image_source public.card_image_source NOT NULL DEFAULT 'none';

CREATE TABLE IF NOT EXISTS public.psa_cert_cache (
  cert_number text PRIMARY KEY,
  status text NOT NULL CHECK (status IN ('found', 'no_image', 'invalid', 'error')),
  front_image_url text,
  back_image_url text,
  payload jsonb,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now(),
  last_error text
);

CREATE INDEX IF NOT EXISTS idx_psa_cert_cache_expires_at
  ON public.psa_cert_cache (expires_at);

UPDATE public.collection_items
SET psa_cert_number = NULLIF(BTRIM(COALESCE(psa_cert_number, cert_number)), '')
WHERE COALESCE(psa_cert_number, cert_number) IS NOT NULL;

UPDATE public.business_inventory_items
SET psa_cert_number = NULLIF(BTRIM(COALESCE(psa_cert_number, cert_number)), '')
WHERE COALESCE(psa_cert_number, cert_number) IS NOT NULL;

UPDATE public.cards
SET psa_cert_number = NULLIF(BTRIM(psa_cert_number), '')
WHERE psa_cert_number IS NOT NULL;

INSERT INTO public.collection_items (
  id,
  user_id,
  item_kind,
  title,
  player_name,
  year,
  set_name,
  grade,
  purchase_price,
  image_url,
  psa_cert_number,
  image_source,
  created_at,
  updated_at
)
SELECT
  c.id,
  COALESCE(c.user_id, img.user_id),
  'owned',
  NULLIF(BTRIM(CONCAT_WS(' ', c.year, c.player_name, c.set_name, c.grade)), ''),
  COALESCE(NULLIF(BTRIM(c.player_name), ''), 'Legacy card'),
  NULLIF(BTRIM(c.year), ''),
  NULLIF(BTRIM(c.set_name), ''),
  NULLIF(BTRIM(c.grade), ''),
  NULL,
  NULLIF(BTRIM(c.user_image_url), ''),
  NULLIF(BTRIM(c.psa_cert_number), ''),
  CASE
    WHEN NULLIF(BTRIM(c.user_image_url), '') IS NOT NULL THEN 'user'::public.card_image_source
    ELSE 'none'::public.card_image_source
  END,
  COALESCE(c.created_at, now()),
  COALESCE(c.updated_at, c.created_at, now())
FROM public.cards c
JOIN LATERAL (
  SELECT ci.user_id
  FROM public.card_images ci
  WHERE ci.card_id = c.id
  ORDER BY ci.created_at ASC
  LIMIT 1
) img ON true
WHERE NOT EXISTS (
  SELECT 1
  FROM public.collection_items existing
  WHERE existing.id = c.id
)
  AND COALESCE(c.user_id, img.user_id) IS NOT NULL;

UPDATE public.card_images
SET label = CASE
  WHEN COALESCE(position, 0) = 0 THEN 'front'
  ELSE 'back'
END
WHERE label IS NULL
   OR BTRIM(label) = ''
   OR label NOT IN ('front', 'back');

ALTER TABLE public.card_images
  DROP CONSTRAINT IF EXISTS card_images_card_id_fkey;

ALTER TABLE public.card_images
  ADD CONSTRAINT card_images_card_id_fkey
  FOREIGN KEY (card_id)
  REFERENCES public.collection_items(id)
  ON DELETE CASCADE;

ALTER TABLE public.card_images
  DROP CONSTRAINT IF EXISTS card_images_label_check;

ALTER TABLE public.card_images
  ADD CONSTRAINT card_images_label_check
  CHECK (label IS NULL OR label IN ('front', 'back'));

DROP POLICY IF EXISTS "Users can insert own card images" ON public.card_images;
DROP POLICY IF EXISTS "Users can view own card images" ON public.card_images;
DROP POLICY IF EXISTS "Users can update own card images" ON public.card_images;
DROP POLICY IF EXISTS "Users can delete own card images" ON public.card_images;

CREATE POLICY "Users can view own card images"
  ON public.card_images
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own card images"
  ON public.card_images
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.collection_items
      WHERE collection_items.id = card_images.card_id
        AND collection_items.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own card images"
  ON public.card_images
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own card images"
  ON public.card_images
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

UPDATE public.collection_items ci
SET image_source = CASE
  WHEN NULLIF(BTRIM(ci.user_image_url), '') IS NOT NULL THEN 'user'::public.card_image_source
  WHEN EXISTS (
    SELECT 1
    FROM public.card_images img
    WHERE img.card_id = ci.id
  ) THEN 'user'::public.card_image_source
  ELSE 'none'::public.card_image_source
END,
image_url = CASE
  WHEN NULLIF(BTRIM(ci.user_image_url), '') IS NOT NULL THEN NULLIF(BTRIM(ci.user_image_url), '')
  WHEN ci.image_source = 'user' THEN ci.image_url
  ELSE NULL
END
WHERE TRUE;

UPDATE public.business_inventory_items bi
SET image_source = CASE
  WHEN NULLIF(BTRIM(bi.user_image_url), '') IS NOT NULL THEN 'user'::public.card_image_source
  WHEN EXISTS (
    SELECT 1
    FROM public.card_images img
    WHERE img.card_id::text = COALESCE(NULLIF(BTRIM(bi.card_id), ''), bi.id::text)
  ) THEN 'user'::public.card_image_source
  ELSE 'none'::public.card_image_source
END,
image_url = CASE
  WHEN NULLIF(BTRIM(bi.user_image_url), '') IS NOT NULL THEN NULLIF(BTRIM(bi.user_image_url), '')
  WHEN bi.image_source = 'user' THEN bi.image_url
  ELSE NULL
END
WHERE TRUE;

UPDATE public.cards c
SET image_source = CASE
  WHEN NULLIF(BTRIM(c.user_image_url), '') IS NOT NULL THEN 'user'::public.card_image_source
  WHEN EXISTS (
    SELECT 1
    FROM public.card_images img
    WHERE img.card_id = c.id
  ) THEN 'user'::public.card_image_source
  ELSE 'none'::public.card_image_source
END,
image_url = CASE
  WHEN NULLIF(BTRIM(c.user_image_url), '') IS NOT NULL THEN NULLIF(BTRIM(c.user_image_url), '')
  WHEN c.image_source = 'user' THEN c.image_url
  ELSE NULL
END
WHERE TRUE;

COMMENT ON TABLE public.psa_cert_cache IS 'Cached PSA cert lookups used to resolve trustworthy front/back slab images.';
COMMENT ON COLUMN public.collection_items.image_source IS 'Trusted image source. PSA is preferred over user uploads when a valid PSA cert image exists.';
COMMENT ON COLUMN public.business_inventory_items.image_source IS 'Trusted image source. PSA is preferred over user uploads when a valid PSA cert image exists.';
COMMENT ON COLUMN public.cards.image_source IS 'Trusted image source for legacy card rows.';
