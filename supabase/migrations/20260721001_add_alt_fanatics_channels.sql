-- Add 'alt' (Alt marketplace) and 'fanatics' (Fanatics Collect) as valid
-- sale/inventory channels. The channel CHECK constraints on these three tables
-- would otherwise reject the new values at the database level.
alter table public.collection_items
  drop constraint if exists collection_items_channel_check;
alter table public.collection_items
  add constraint collection_items_channel_check
  check (channel = any (array['ebay','whatnot','alt','fanatics','instagram','show','local','other','veriswap']::text[]));

alter table public.business_inventory_items
  drop constraint if exists business_inventory_items_channel_check;
alter table public.business_inventory_items
  add constraint business_inventory_items_channel_check
  check (channel = any (array['ebay','whatnot','alt','fanatics','instagram','show','local','other','veriswap']::text[]));

alter table public.business_sales
  drop constraint if exists business_sales_channel_check;
alter table public.business_sales
  add constraint business_sales_channel_check
  check (channel = any (array['ebay','whatnot','alt','fanatics','instagram','show','local','other','veriswap']::text[]));
