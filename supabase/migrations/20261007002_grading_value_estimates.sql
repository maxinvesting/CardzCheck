-- Estimated sale value at each possible grade for a card out at grading,
-- e.g. {"10": 120000, "9": 40000, "8": 25000, "7": 18000} (cents). Drives the
-- returns forecast on the card profile.
alter table public.collection_items
  add column if not exists grading_value_estimates jsonb;
