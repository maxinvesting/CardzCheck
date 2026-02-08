-- Add structured parallel_type and card_number columns to collection_items
-- These fields support CMV recalculation without parsing free-text notes.
ALTER TABLE collection_items
  ADD COLUMN IF NOT EXISTS parallel_type text,
  ADD COLUMN IF NOT EXISTS card_number text;
