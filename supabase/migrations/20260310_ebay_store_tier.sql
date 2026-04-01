-- eBay store tier preference on ebay_accounts
-- Migration: 20260310_ebay_store_tier.sql

ALTER TABLE public.ebay_accounts
  ADD COLUMN IF NOT EXISTS store_tier TEXT NOT NULL DEFAULT 'none'
  CHECK (store_tier IN ('none', 'starter', 'basic', 'premium', 'anchor', 'enterprise'));

