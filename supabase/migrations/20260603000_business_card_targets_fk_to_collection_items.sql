-- Migration: Repoint business_card_targets.inventory_item_id FK to collection_items.
-- Date: 2026-06-03
--
-- The business inventory is stored in collection_items (item_kind='inventory'),
-- and getInventoryItem() / the targets API both resolve itemId against
-- collection_items. The original FK still referenced the legacy
-- business_inventory_items table, so every target insert failed with
-- "business_card_targets_inventory_item_id_fkey" violations. Point the FK at the
-- table the app actually uses.

ALTER TABLE public.business_card_targets
  DROP CONSTRAINT IF EXISTS business_card_targets_inventory_item_id_fkey;

ALTER TABLE public.business_card_targets
  ADD CONSTRAINT business_card_targets_inventory_item_id_fkey
  FOREIGN KEY (inventory_item_id)
  REFERENCES public.collection_items(id)
  ON DELETE CASCADE;
