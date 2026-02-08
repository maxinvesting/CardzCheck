-- Migration: Create recent_searches table for persistent search history
-- Created: 2025-01-31

-- Create recent_searches table
CREATE TABLE IF NOT EXISTS recent_searches (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  search_query TEXT NOT NULL,
  card_name TEXT, -- Extracted/parsed card name for display
  filters_used JSONB DEFAULT '{}'::jsonb, -- Stores parsed search parameters
  result_count INTEGER, -- Number of results returned
  cmv NUMERIC(12,2), -- Current market value at time of search
  searched_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_recent_searches_user_searched ON recent_searches(user_id, searched_at DESC);

-- Enable Row Level Security
ALTER TABLE recent_searches ENABLE ROW LEVEL SECURITY;

-- RLS Policies for recent_searches
-- Users can only view their own searches
DROP POLICY IF EXISTS "Users can view own searches" ON recent_searches;
CREATE POLICY "Users can view own searches"
  ON recent_searches FOR SELECT
  USING (auth.uid() = user_id);

-- Users can only create searches for themselves
DROP POLICY IF EXISTS "Users can create own searches" ON recent_searches;
CREATE POLICY "Users can create own searches"
  ON recent_searches FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can only delete their own searches
DROP POLICY IF EXISTS "Users can delete own searches" ON recent_searches;
CREATE POLICY "Users can delete own searches"
  ON recent_searches FOR DELETE
  USING (auth.uid() = user_id);

-- Function to clean up old searches and keep only last 20 per user
CREATE OR REPLACE FUNCTION cleanup_old_searches()
RETURNS TRIGGER AS $$
BEGIN
  -- Delete searches beyond the 20 most recent for this user
  DELETE FROM recent_searches
  WHERE id IN (
    SELECT id FROM recent_searches
    WHERE user_id = NEW.user_id
    ORDER BY searched_at DESC
    OFFSET 20
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-cleanup old searches after insert
DROP TRIGGER IF EXISTS cleanup_old_searches_trigger ON recent_searches;
CREATE TRIGGER cleanup_old_searches_trigger
  AFTER INSERT ON recent_searches
  FOR EACH ROW
  EXECUTE FUNCTION cleanup_old_searches();
