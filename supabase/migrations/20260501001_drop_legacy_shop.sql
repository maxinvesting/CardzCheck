-- Migration: Drop legacy shop schema (Part 8 cleanup)
-- Date: 2026-05-01
--
-- The new marketplace (listings / transactions / marketplace_cards) is live.
-- No live orders exist on shop_orders per pre-migration check.
--
-- Drops in dependency order: dependent tables first, then base tables.

DROP TABLE IF EXISTS public.shop_orders CASCADE;
DROP TABLE IF EXISTS public.shop_waitlist CASCADE;
DROP TABLE IF EXISTS public.shop_listings CASCADE;
