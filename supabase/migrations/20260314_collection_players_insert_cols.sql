-- Add first-class columns for multi-player arrays and insert type on collection_items.
--
-- Previously these were serialised into the notes field as:
--   [INSERT:Downtown] | [PLAYERS:["Player A","Player B"]]
--
-- Adding proper columns lets us:
--   • query/filter by insert type or individual players
--   • avoid parsing hacks in the API layer
--   • keep notes clean for real user notes
--
-- The API layer (app/api/collection/route.ts) already sends these fields in
-- insertPayload and uses the schema-fallback retry to handle missing columns.
-- Once this migration is applied the fallback loop will succeed on the first
-- attempt and the columns will be populated correctly.

alter table public.collection_items
  add column if not exists players jsonb,
  add column if not exists insert_type text;

-- GIN index so we can efficiently query players @> '["Some Name"]'::jsonb
create index if not exists collection_items_players_gin
  on public.collection_items using gin (players);

-- btree index for insert_type equality / range scans
create index if not exists collection_items_insert_type_idx
  on public.collection_items (insert_type)
  where insert_type is not null;

comment on column public.collection_items.players is
  'Array of player names for multi-player cards (e.g. dual autographs). NULL for single-player cards.';

comment on column public.collection_items.insert_type is
  'Insert type descriptor (e.g. ''Downtown'', ''Prizm'', ''Optic''). Separate from parallel_type.';
