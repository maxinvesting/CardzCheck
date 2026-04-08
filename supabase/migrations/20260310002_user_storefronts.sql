-- User storefronts: multi-platform storefront URLs for business users.
-- Replaces the single ebay_store_url column on the users table.

create table if not exists public.user_storefronts (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  platform           text not null check (platform in ('ebay','whatnot','website','shopify','mercari','comc','myslabs','custom')),
  display_name       text not null,
  store_url          text not null,
  is_primary         boolean not null default false,
  notes              text,
  platform_settings  jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint user_storefronts_unique_platform unique (user_id, platform, store_url)
);

create index if not exists idx_user_storefronts_user_id on public.user_storefronts(user_id);

-- RLS: business users can only manage their own storefronts.
alter table public.user_storefronts enable row level security;

create policy "Users can view own storefronts"
  on public.user_storefronts for select
  using (auth.uid() = user_id);

create policy "Users can insert own storefronts"
  on public.user_storefronts for insert
  with check (auth.uid() = user_id);

create policy "Users can update own storefronts"
  on public.user_storefronts for update
  using (auth.uid() = user_id);

create policy "Users can delete own storefronts"
  on public.user_storefronts for delete
  using (auth.uid() = user_id);

-- Trigger to keep updated_at in sync.
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_user_storefronts_updated_at on public.user_storefronts;
create trigger trg_user_storefronts_updated_at
  before update on public.user_storefronts
  for each row execute function public.set_updated_at();
