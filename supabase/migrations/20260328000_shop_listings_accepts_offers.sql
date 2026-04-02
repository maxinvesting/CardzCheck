-- Listings that welcome buyer offers (shown in marketplace "Offers only" filter)

ALTER TABLE IF EXISTS public.shop_listings
  ADD COLUMN IF NOT EXISTS accepts_offers boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.shop_listings.accepts_offers IS
  'When true, listing is included in the shop "Offers only" filter and shows an offers badge.';
