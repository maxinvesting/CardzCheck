-- Add ebay_storefront_price to shop_listings
-- This is the public-facing price we charge on our eBay storefront for the same card.
-- Subscriber deals on CardzCheck are always at least 13.5% below this price.
-- Unlike ebay_sold_comp (admin-only sold comp reference), this field is public.

alter table public.shop_listings
  add column if not exists ebay_storefront_price numeric(10, 2) default null;

comment on column public.shop_listings.ebay_storefront_price
  is 'Our eBay storefront listing price for this card. CardzCheck Deals pricing is always at least 13.5% below this figure.';
