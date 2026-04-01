-- Migration: Add 'cancelled' to shop_orders.payment_status and 'archived' to shop_listings.status
-- Date: 2026-03-23

-- ============================================
-- 1. shop_orders: add 'cancelled' payment_status
-- ============================================
ALTER TABLE public.shop_orders
  DROP CONSTRAINT IF EXISTS shop_orders_payment_status_check;

ALTER TABLE public.shop_orders
  ADD CONSTRAINT shop_orders_payment_status_check
  CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded', 'cancelled'));

-- ============================================
-- 2. shop_listings: add 'archived' status
-- ============================================
ALTER TABLE public.shop_listings
  DROP CONSTRAINT IF EXISTS shop_listings_status_check;

ALTER TABLE public.shop_listings
  ADD CONSTRAINT shop_listings_status_check
  CHECK (status IN ('active', 'sold', 'reserved', 'delisted', 'archived'));
