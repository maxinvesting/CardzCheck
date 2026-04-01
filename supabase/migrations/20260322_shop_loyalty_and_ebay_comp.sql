-- Migration: Shop loyalty tracking + eBay comp URL field
-- Date: 2026-03-22

-- ============================================
-- 1. ADD ebay_comp_url TO shop_listings
-- ============================================
-- Allows sellers to attach a direct eBay sold listing URL as a comp reference.
ALTER TABLE public.shop_listings
  ADD COLUMN IF NOT EXISTS ebay_comp_url text;

-- ============================================
-- 2. ADD user_id LINKAGE TO shop_orders
-- ============================================
-- Optional linkage to auth users so loyalty tracking works when buyer is logged in.
ALTER TABLE public.shop_orders
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_shop_orders_user_id
  ON public.shop_orders (user_id);

CREATE INDEX IF NOT EXISTS idx_shop_orders_buyer_email
  ON public.shop_orders (buyer_email);
