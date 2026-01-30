-- Migration: Create collection_items table if not present
-- Date: 2025-01-27
-- Safe to run: uses IF NOT EXISTS; idempotent policies

CREATE TABLE IF NOT EXISTS collection_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  player_name TEXT NOT NULL,
  year TEXT,
  set_name TEXT,
  grade TEXT,
  purchase_price DECIMAL(10,2),
  purchase_date TEXT,
  image_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_collection_items_user_id ON collection_items(user_id);
CREATE INDEX IF NOT EXISTS idx_collection_items_created_at ON collection_items(created_at DESC);

ALTER TABLE collection_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own collection items" ON collection_items;
CREATE POLICY "Users can view own collection items"
  ON collection_items FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create own collection items" ON collection_items;
CREATE POLICY "Users can create own collection items"
  ON collection_items FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own collection items" ON collection_items;
CREATE POLICY "Users can update own collection items"
  ON collection_items FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own collection items" ON collection_items;
CREATE POLICY "Users can delete own collection items"
  ON collection_items FOR DELETE
  USING (auth.uid() = user_id);
