-- collection_items.card_number was created as integer in an early migration,
-- which blocks alphanumeric card numbers (e.g. Panini insert codes like
-- "DNSAMN", "MMJJM"). All consumers already treat it as a string, and sibling
-- tables (cards, bulk_batch_items, marketplace_cards, watchlist) store it as
-- text. Cast to text so bulk PSA cert imports stop failing on alphanumerics.
ALTER TABLE public.collection_items
  ALTER COLUMN card_number TYPE text USING card_number::text;
