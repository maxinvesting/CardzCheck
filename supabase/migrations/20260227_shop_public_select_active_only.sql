-- Migration: Ensure shop_listings public read is restricted to active listings
-- Date: 2026-02-27

ALTER TABLE IF EXISTS public.shop_listings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read active listings" ON public.shop_listings;
CREATE POLICY "Public can read active listings"
  ON public.shop_listings FOR SELECT
  USING (status = 'active');
