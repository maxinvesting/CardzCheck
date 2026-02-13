-- Add collection thumbnail + explicit CMV lifecycle fields.
-- Safe to run repeatedly.

alter table if exists collection_items
  add column if not exists thumbnail_url text,
  add column if not exists cmv_status text,
  add column if not exists cmv_value numeric,
  add column if not exists cmv_error text,
  add column if not exists cmv_updated_at timestamptz;

alter table if exists collection_items
  alter column cmv_status set default 'pending';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'collection_items_cmv_status_check'
  ) then
    alter table collection_items
      add constraint collection_items_cmv_status_check
      check (cmv_status in ('pending', 'ready', 'failed'));
  end if;
end $$;

update collection_items
set thumbnail_url = regexp_replace(image_url, '^http://', 'https://')
where (thumbnail_url is null or btrim(thumbnail_url) = '')
  and image_url is not null
  and btrim(image_url) <> ''
  and image_url ~* '^https?://';

update collection_items
set thumbnail_url = regexp_replace(thumbnail_url, '^http://', 'https://')
where thumbnail_url ~* '^http://';

update collection_items
set cmv_value = coalesce(cmv_value, est_cmv, estimated_cmv)
where cmv_value is null
  and (est_cmv is not null or estimated_cmv is not null);

update collection_items
set cmv_status = case
  when coalesce(cmv_value, est_cmv, estimated_cmv) is not null then 'ready'
  when cmv_confidence = 'unavailable' then 'failed'
  else 'pending'
end
where cmv_status is null;

update collection_items
set cmv_updated_at = coalesce(cmv_updated_at, cmv_last_updated, created_at, now())
where cmv_updated_at is null;

