-- Migration: 20260316_backfill_ebay_channel.sql
-- Backfill channel='ebay' for any business_inventory_items that have an ebay_item_id
-- but were created before the event-handlers were updated to write channel automatically.
-- Safe to run multiple times (idempotent WHERE condition).

UPDATE public.business_inventory_items
SET
  channel    = 'ebay',
  updated_at = now()
WHERE
  ebay_item_id IS NOT NULL
  AND channel <> 'ebay';
