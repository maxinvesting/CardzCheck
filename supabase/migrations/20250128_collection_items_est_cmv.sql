-- Add est_cmv to collection_items for storing estimated market value (e.g. from comps)
-- Safe to run: uses IF NOT EXISTS where supported

ALTER TABLE collection_items ADD COLUMN IF NOT EXISTS est_cmv DECIMAL(10,2);
