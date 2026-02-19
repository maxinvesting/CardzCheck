-- Add collection acquisition metadata and canonical image URL fields.
ALTER TABLE collection_items
  ADD COLUMN IF NOT EXISTS acquisition_type text,
  ADD COLUMN IF NOT EXISTS user_image_url text,
  ADD COLUMN IF NOT EXISTS stock_image_url text,
  ADD COLUMN IF NOT EXISTS ebay_image_url text;

ALTER TABLE collection_items
  ALTER COLUMN acquisition_type SET DEFAULT 'unknown';

UPDATE collection_items
SET acquisition_type = 'unknown'
WHERE acquisition_type IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'collection_items_acquisition_type_check'
  ) THEN
    ALTER TABLE collection_items
      ADD CONSTRAINT collection_items_acquisition_type_check
      CHECK (acquisition_type IN ('pulled', 'bought', 'trade', 'gift', 'unknown'));
  END IF;
END $$;
