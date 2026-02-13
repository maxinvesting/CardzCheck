-- Ensure collection_items has typed optional enrichment fields used by Add to Collection.
-- parallel_type stays nullable text.
-- card_number should be nullable integer for normalized inserts.

alter table if exists collection_items
  add column if not exists parallel_type text;

do $$
declare
  existing_type text;
begin
  select data_type
  into existing_type
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'collection_items'
    and column_name = 'card_number';

  if existing_type is null then
    alter table collection_items
      add column card_number integer;
  elsif existing_type <> 'integer' then
    alter table collection_items
      alter column card_number type integer
      using (
        case
          when nullif(trim(card_number::text), '') is null then null
          when trim(card_number::text) ~ '^[0-9]+$' then trim(card_number::text)::integer
          else null
        end
      );
  end if;
end $$;
