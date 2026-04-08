-- Cards catalog table
-- Stores card identities used by CardPicker, card search, and card_images FK
-- Must be created before card_images (20260203), indexes (20260203), and search_text (20260203)

CREATE TABLE IF NOT EXISTS public.cards (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  year          text,
  brand         text,
  set_name      text,
  player_name   text,
  variant       text,
  grader        text,
  grade         text,
  card_number   text,
  image_url     text,
  user_image_url text,
  stock_image_url text,
  ebay_image_url text,
  search_text   text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Anyone can read cards"
  ON public.cards FOR SELECT
  USING (true);

CREATE POLICY IF NOT EXISTS "Users can insert own cards"
  ON public.cards FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY IF NOT EXISTS "Users can update own cards"
  ON public.cards FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Users can delete own cards"
  ON public.cards FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
