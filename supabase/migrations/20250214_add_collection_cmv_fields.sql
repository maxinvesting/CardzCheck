alter table if exists collection_items
  add column if not exists estimated_cmv numeric,
  add column if not exists cmv_confidence text default 'unavailable',
  add column if not exists cmv_last_updated timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'collection_items_cmv_confidence_check'
  ) then
    alter table collection_items
      add constraint collection_items_cmv_confidence_check
      check (cmv_confidence in ('high', 'medium', 'low', 'unavailable'));
  end if;
end $$;

update collection_items
set cmv_confidence = 'unavailable'
where cmv_confidence is null;
