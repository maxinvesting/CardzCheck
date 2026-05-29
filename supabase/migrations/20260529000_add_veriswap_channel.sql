-- Add 'veriswap' as a valid sales/inventory channel

-- business_inventory_items
ALTER TABLE public.business_inventory_items
  DROP CONSTRAINT IF EXISTS business_inventory_items_channel_check;
ALTER TABLE public.business_inventory_items
  ADD CONSTRAINT business_inventory_items_channel_check
  CHECK (channel IN ('ebay', 'whatnot', 'instagram', 'show', 'local', 'other', 'veriswap'));

-- business_sales
ALTER TABLE public.business_sales
  DROP CONSTRAINT IF EXISTS business_sales_channel_check;
ALTER TABLE public.business_sales
  ADD CONSTRAINT business_sales_channel_check
  CHECK (channel IN ('ebay', 'whatnot', 'local', 'instagram', 'show', 'other', 'veriswap'));

-- collection_items
ALTER TABLE public.collection_items
  DROP CONSTRAINT IF EXISTS collection_items_channel_check;
ALTER TABLE public.collection_items
  ADD CONSTRAINT collection_items_channel_check
  CHECK (channel IN ('ebay', 'whatnot', 'instagram', 'show', 'local', 'other', 'veriswap'));
