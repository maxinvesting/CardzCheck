-- card_comps: one row per comparable sale, per card
-- Supports manual entry and future auto-ingestion from eBay or other sources.
create table public.card_comps (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.collection_items(id) on delete cascade,
  title text not null,
  price numeric(10,2) not null check (price >= 0),
  date_sold timestamptz,
  source text not null default 'ebay',
  grade text,
  match_quality text not null default 'near' check (match_quality in ('exact', 'near', 'weak')),
  is_selected boolean not null default true,
  ebay_url text,
  created_at timestamptz not null default now()
);

-- card_cmv: one calculated CMV record per card (upserted on recalculate)
-- cmv_value / cmv_low / cmv_high are null until at least one comp is selected.
create table public.card_cmv (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null unique references public.collection_items(id) on delete cascade,
  cmv_value numeric(10,2),
  cmv_low numeric(10,2),
  cmv_high numeric(10,2),
  confidence text not null default 'low' check (confidence in ('high', 'medium', 'low')),
  comps_count int not null default 0,
  excluded_count int not null default 0,
  last_updated timestamptz not null default now()
);

-- RLS: owner-only access via collection_items.user_id join
alter table public.card_comps enable row level security;
alter table public.card_cmv enable row level security;

create policy "owner_all_card_comps" on public.card_comps
  for all
  using (
    exists (
      select 1 from public.collection_items ci
      where ci.id = card_comps.card_id
        and ci.user_id = auth.uid()
    )
  );

create policy "owner_all_card_cmv" on public.card_cmv
  for all
  using (
    exists (
      select 1 from public.collection_items ci
      where ci.id = card_cmv.card_id
        and ci.user_id = auth.uid()
    )
  );

-- Performance indexes
create index card_comps_card_id_idx on public.card_comps(card_id);
create index card_comps_card_id_selected_idx on public.card_comps(card_id, is_selected);
create index card_cmv_card_id_idx on public.card_cmv(card_id);
