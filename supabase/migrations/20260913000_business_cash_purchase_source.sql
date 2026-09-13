-- Migration: allow 'purchase' as a business_cash_transactions source_type.
-- Date: 2026-09-13
--
-- Buying a card into inventory spends cash. We record that outflow as a
-- source-linked cash row (kind = 'purchase', source_type = 'purchase',
-- source_id = the inventory item id) so it reverses automatically when the
-- item's cost is edited or the item is deleted — exactly like sale/trade rows.
-- `kind` already permitted 'purchase'; only `source_type` needs widening.

ALTER TABLE public.business_cash_transactions
  DROP CONSTRAINT IF EXISTS business_cash_transactions_source_type_check;

ALTER TABLE public.business_cash_transactions
  ADD CONSTRAINT business_cash_transactions_source_type_check
  CHECK (source_type IN ('sale', 'trade', 'purchase'));
