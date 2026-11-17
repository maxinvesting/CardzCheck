-- Consignment orders are now entered after they're done: each card carries what
-- it sold for, the order's consignor fees are split evenly, and every card is
-- booked as a sale on the new 'consignment' channel.

alter table public.consignment_orders
  add column if not exists fees_total_cents integer not null default 0;

alter table public.consignment_order_items
  add column if not exists sold_price_cents integer,
  add column if not exists fee_cents integer not null default 0,
  -- true when the inventory row was created for a hand-typed card (deleted with the order)
  add column if not exists created_inventory boolean not null default false;

alter table public.business_sales
  drop constraint if exists business_sales_channel_check;
alter table public.business_sales
  add constraint business_sales_channel_check
  check (channel = any (array['ebay','whatnot','alt','fanatics','instagram','show','local','other','veriswap','consignment']::text[]));
