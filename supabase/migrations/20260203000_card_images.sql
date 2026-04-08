-- Card Images Table
-- Stores multiple images per card with position/ordering support

CREATE TABLE IF NOT EXISTS card_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id uuid NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  storage_path text NOT NULL,
  position int NOT NULL DEFAULT 0,
  label text NULL,
  created_at timestamptz DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_card_images_card_id_position ON card_images(card_id, position);
CREATE INDEX IF NOT EXISTS idx_card_images_user_id ON card_images(user_id);

-- RLS Policies
ALTER TABLE card_images ENABLE ROW LEVEL SECURITY;

-- Users can view their own card images
CREATE POLICY "Users can view own card images"
  ON card_images
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can insert card images for their own cards
CREATE POLICY "Users can insert own card images"
  ON card_images
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM cards
      WHERE cards.id = card_images.card_id
      AND cards.user_id = auth.uid()
    )
  );

-- Users can update their own card images
CREATE POLICY "Users can update own card images"
  ON card_images
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own card images
CREATE POLICY "Users can delete own card images"
  ON card_images
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Comment for documentation
COMMENT ON TABLE card_images IS 'Stores multiple images per card with position ordering. Position 0 is the primary image shown in grids.';
