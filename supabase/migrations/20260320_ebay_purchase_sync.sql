-- eBay Purchase Sync: deduplication columns and last-sync tracking
-- Migration: 20260320_ebay_purchase_sync.sql

-- ============================================================
-- 1. collection_items — track source eBay purchase order/line
-- ============================================================
-- Used to deduplicate: skip insert if this order line was already imported.

ALTER TABLE public.collection_items
  ADD COLUMN IF NOT EXISTS ebay_purchase_order_id TEXT,
  ADD COLUMN IF NOT EXISTS ebay_purchase_line_item_id TEXT;

CREATE INDEX IF NOT EXISTS idx_collection_items_ebay_purchase
  ON public.collection_items (user_id, ebay_purchase_order_id, ebay_purchase_line_item_id)
  WHERE ebay_purchase_order_id IS NOT NULL;

-- ============================================================
-- 2. ebay_accounts — track last successful purchase sync time
-- ============================================================
-- Incremental sync: only fetch orders created after this timestamp.

ALTER TABLE public.ebay_accounts
  ADD COLUMN IF NOT EXISTS purchases_last_synced_at TIMESTAMPTZ;
