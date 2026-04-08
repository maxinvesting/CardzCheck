-- CardzCheck Pegged Market (Prototype)
-- Core SKU, sold comp, and peg update audit tables.

create extension if not exists pgcrypto;
create table if not exists public.skus (
  id uuid primary key default gen_random_uuid(),
  sku_id text not null unique,
  name text not null,
  details jsonb not null default '{}'::jsonb,
  image_url text,
  created_at timestamptz not null default now()
);
create table if not exists public.sold_comps (
  id uuid primary key default gen_random_uuid(),
  sku_id text not null,
  price_cents bigint not null check (price_cents > 0),
  sold_at timestamptz not null,
  source text,
  external_id text,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint sold_comps_sku_fk foreign key (sku_id) references public.skus (sku_id) on delete cascade
);
create table if not exists public.peg_updates (
  id uuid primary key default gen_random_uuid(),
  sku_id text not null,
  peg_price bigint not null check (peg_price > 0),
  method int not null,
  n int not null,
  window_seconds int not null,
  sales_hash text not null,
  observed_at timestamptz not null,
  nonce bigint not null,
  tx_hash text,
  created_at timestamptz not null default now(),
  constraint peg_updates_sku_fk foreign key (sku_id) references public.skus (sku_id) on delete cascade,
  constraint peg_updates_sku_nonce_unique unique (sku_id, nonce)
);
create index if not exists idx_skus_created_at on public.skus (created_at desc);
create index if not exists idx_sold_comps_sku_sold_at on public.sold_comps (sku_id, sold_at desc);
create index if not exists idx_sold_comps_source_external on public.sold_comps (source, external_id);
create index if not exists idx_peg_updates_sku_observed_at on public.peg_updates (sku_id, observed_at desc);
create index if not exists idx_peg_updates_observed_at on public.peg_updates (observed_at desc);
create index if not exists idx_peg_updates_tx_hash on public.peg_updates (tx_hash);
