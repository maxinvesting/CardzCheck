-- Add image URL columns to business_inventory_items for Card Profile display
ALTER TABLE business_inventory_items
  ADD COLUMN IF NOT EXISTS user_image_url  text,
  ADD COLUMN IF NOT EXISTS stock_image_url text,
  ADD COLUMN IF NOT EXISTS ebay_image_url  text;
