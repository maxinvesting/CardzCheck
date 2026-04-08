-- Add insert column to collection_items for card insert/variation type
-- Previously stored as [INSERT:...] in the notes field as a workaround
ALTER TABLE collection_items ADD COLUMN IF NOT EXISTS "insert" text;
