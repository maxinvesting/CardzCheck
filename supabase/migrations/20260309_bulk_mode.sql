-- ============================================================
-- Bulk Mode: high-volume low-end card processing workflow
-- Helps sellers batch-process $1–$10 cards for eBay listing
-- ============================================================

-- ----------------------------------------------------------------
-- bulk_batches: top-level container for a processing session
-- ----------------------------------------------------------------
create table if not exists bulk_batches (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  -- pending: created, awaiting items
  -- processing: identification/pricing running
  -- ready: all items processed, ready for review
  -- archived: user is done with this batch
  status      text not null default 'pending'
                check (status in ('pending', 'processing', 'ready', 'archived')),
  item_count  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists bulk_batches_user_id_idx on bulk_batches(user_id);
create index if not exists bulk_batches_user_status_idx on bulk_batches(user_id, status);
-- ----------------------------------------------------------------
-- bulk_batch_items: one card image slot inside a batch
-- Each item represents a single physical card being evaluated
-- ----------------------------------------------------------------
create table if not exists bulk_batch_items (
  id                  uuid primary key default gen_random_uuid(),
  batch_id            uuid not null references bulk_batches(id) on delete cascade,
  position            integer not null default 0,
  -- pending: awaiting processing
  -- identified: identification complete
  -- priced: pricing+strategy computed
  -- approved: user approved for listing
  -- skipped: user decided to skip
  status              text not null default 'pending'
                        check (status in ('pending', 'identified', 'priced', 'approved', 'skipped')),
  primary_image_url   text,        -- front of card
  secondary_image_url text,        -- back of card (optional)
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists bulk_batch_items_batch_id_idx on bulk_batch_items(batch_id);
create index if not exists bulk_batch_items_batch_status_idx on bulk_batch_items(batch_id, status);
-- ----------------------------------------------------------------
-- bulk_item_identifications: AI/rule-based card identification result
-- ----------------------------------------------------------------
create table if not exists bulk_item_identifications (
  id                    uuid primary key default gen_random_uuid(),
  item_id               uuid not null references bulk_batch_items(id) on delete cascade,
  title_candidate       text,           -- best title string for eBay listing
  player                text,
  brand                 text,
  set_name              text,
  year                  text,
  card_number           text,           -- stored as text to preserve alphanumeric (e.g. "RC-12")
  rookie_flag           boolean not null default false,
  insert_parallel_notes text,           -- e.g. "Gold Prizm /10", "Optic Holo"
  -- 0.0–1.0 numeric confidence for downstream logic
  confidence            numeric(4,3) not null default 0.0 check (confidence >= 0 and confidence <= 1),
  needs_review          boolean not null default true,
  raw_response_json     jsonb,          -- stores full AI response for debugging
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create unique index if not exists bulk_item_identifications_item_id_idx on bulk_item_identifications(item_id);
-- ----------------------------------------------------------------
-- bulk_item_pricing: low-end price estimate for a single card
-- ----------------------------------------------------------------
create table if not exists bulk_item_pricing (
  id                      uuid primary key default gen_random_uuid(),
  item_id                 uuid not null references bulk_batch_items(id) on delete cascade,
  suggested_listing_price numeric(10,2),    -- recommended list price
  estimated_sale_price    numeric(10,2),    -- expected average sale
  -- 0.0–1.0 confidence in the price estimate
  pricing_confidence      numeric(4,3) not null default 0.0 check (pricing_confidence >= 0 and pricing_confidence <= 1),
  pricing_notes           text,             -- human-readable rationale
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create unique index if not exists bulk_item_pricing_item_id_idx on bulk_item_pricing(item_id);
-- ----------------------------------------------------------------
-- bulk_item_strategy: operational recommendation per card
-- ----------------------------------------------------------------
create table if not exists bulk_item_strategy (
  id                      uuid primary key default gen_random_uuid(),
  item_id                 uuid not null references bulk_batch_items(id) on delete cascade,
  -- single: list individually
  -- multi_quantity: list as multi-quantity lot
  -- bundle_candidate: group with similar cards
  -- skip: not worth listing
  recommended_strategy    text not null default 'skip'
                            check (recommended_strategy in ('single', 'multi_quantity', 'bundle_candidate', 'skip')),
  estimated_shipping_cost numeric(10,2),
  estimated_ebay_fee      numeric(10,2),
  estimated_net_profit    numeric(10,2),
  ese_eligible            boolean not null default false,   -- eBay Standard Envelope eligible
  not_worth_listing       boolean not null default false,
  rationale               text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create unique index if not exists bulk_item_strategy_item_id_idx on bulk_item_strategy(item_id);
-- ----------------------------------------------------------------
-- bulk_listing_drafts: draft eBay listing payload for approved items
-- ----------------------------------------------------------------
create table if not exists bulk_listing_drafts (
  id                  uuid primary key default gen_random_uuid(),
  item_id             uuid not null references bulk_batch_items(id) on delete cascade,
  -- draft: generated, not yet reviewed
  -- approved: user approved
  -- exported: sent to eBay or exported
  draft_status        text not null default 'draft'
                        check (draft_status in ('draft', 'approved', 'exported')),
  listing_payload_json jsonb not null default '{}',   -- full draft eBay listing data
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create unique index if not exists bulk_listing_drafts_item_id_idx on bulk_listing_drafts(item_id);
create index if not exists bulk_listing_drafts_item_status_idx on bulk_listing_drafts(item_id, draft_status);
-- ----------------------------------------------------------------
-- Row Level Security: users only see their own batches and items
-- ----------------------------------------------------------------
alter table bulk_batches enable row level security;
alter table bulk_batch_items enable row level security;
alter table bulk_item_identifications enable row level security;
alter table bulk_item_pricing enable row level security;
alter table bulk_item_strategy enable row level security;
alter table bulk_listing_drafts enable row level security;
-- bulk_batches: direct user_id check
DROP POLICY IF EXISTS "Users can manage their own bulk batches" ON bulk_batches;
create policy "Users can manage their own bulk batches"
  on bulk_batches for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
-- bulk_batch_items: check via parent batch
DROP POLICY IF EXISTS "Users can manage items in their batches" ON bulk_batch_items;
create policy "Users can manage items in their batches"
  on bulk_batch_items for all
  using (exists (
    select 1 from bulk_batches b
    where b.id = bulk_batch_items.batch_id and b.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from bulk_batches b
    where b.id = bulk_batch_items.batch_id and b.user_id = auth.uid()
  ));
-- identification / pricing / strategy / drafts: check via item → batch
DROP POLICY IF EXISTS "Users can manage identifications in their batches" ON bulk_item_identifications;
create policy "Users can manage identifications in their batches"
  on bulk_item_identifications for all
  using (exists (
    select 1 from bulk_batch_items i
    join bulk_batches b on b.id = i.batch_id
    where i.id = bulk_item_identifications.item_id and b.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from bulk_batch_items i
    join bulk_batches b on b.id = i.batch_id
    where i.id = bulk_item_identifications.item_id and b.user_id = auth.uid()
  ));
DROP POLICY IF EXISTS "Users can manage pricing in their batches" ON bulk_item_pricing;
create policy "Users can manage pricing in their batches"
  on bulk_item_pricing for all
  using (exists (
    select 1 from bulk_batch_items i
    join bulk_batches b on b.id = i.batch_id
    where i.id = bulk_item_pricing.item_id and b.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from bulk_batch_items i
    join bulk_batches b on b.id = i.batch_id
    where i.id = bulk_item_pricing.item_id and b.user_id = auth.uid()
  ));
DROP POLICY IF EXISTS "Users can manage strategy in their batches" ON bulk_item_strategy;
create policy "Users can manage strategy in their batches"
  on bulk_item_strategy for all
  using (exists (
    select 1 from bulk_batch_items i
    join bulk_batches b on b.id = i.batch_id
    where i.id = bulk_item_strategy.item_id and b.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from bulk_batch_items i
    join bulk_batches b on b.id = i.batch_id
    where i.id = bulk_item_strategy.item_id and b.user_id = auth.uid()
  ));
DROP POLICY IF EXISTS "Users can manage listing drafts in their batches" ON bulk_listing_drafts;
create policy "Users can manage listing drafts in their batches"
  on bulk_listing_drafts for all
  using (exists (
    select 1 from bulk_batch_items i
    join bulk_batches b on b.id = i.batch_id
    where i.id = bulk_listing_drafts.item_id and b.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from bulk_batch_items i
    join bulk_batches b on b.id = i.batch_id
    where i.id = bulk_listing_drafts.item_id and b.user_id = auth.uid()
  ));
-- ----------------------------------------------------------------
-- updated_at triggers (match pattern used elsewhere in schema)
-- ----------------------------------------------------------------
create or replace function update_bulk_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
DROP TRIGGER IF EXISTS trg_bulk_batches_updated_at ON public.bulk_batches;
create trigger trg_bulk_batches_updated_at
  before update on bulk_batches
  for each row execute function update_bulk_updated_at();
DROP TRIGGER IF EXISTS trg_bulk_batch_items_updated_at ON public.bulk_batch_items;
create trigger trg_bulk_batch_items_updated_at
  before update on bulk_batch_items
  for each row execute function update_bulk_updated_at();
DROP TRIGGER IF EXISTS trg_bulk_item_identifications_updated_at ON public.bulk_item_identifications;
create trigger trg_bulk_item_identifications_updated_at
  before update on bulk_item_identifications
  for each row execute function update_bulk_updated_at();
DROP TRIGGER IF EXISTS trg_bulk_item_pricing_updated_at ON public.bulk_item_pricing;
create trigger trg_bulk_item_pricing_updated_at
  before update on bulk_item_pricing
  for each row execute function update_bulk_updated_at();
DROP TRIGGER IF EXISTS trg_bulk_item_strategy_updated_at ON public.bulk_item_strategy;
create trigger trg_bulk_item_strategy_updated_at
  before update on bulk_item_strategy
  for each row execute function update_bulk_updated_at();
DROP TRIGGER IF EXISTS trg_bulk_listing_drafts_updated_at ON public.bulk_listing_drafts;
create trigger trg_bulk_listing_drafts_updated_at
  before update on bulk_listing_drafts
  for each row execute function update_bulk_updated_at();
-- ----------------------------------------------------------------
-- Helper RPC: increment item_count on a batch
-- Called by the items POST endpoint after inserting items.
-- ----------------------------------------------------------------
create or replace function increment_bulk_batch_item_count(
  p_batch_id uuid,
  p_increment integer default 1
)
returns void language sql security definer as $$
  update bulk_batches
  set item_count = item_count + p_increment,
      updated_at = now()
  where id = p_batch_id
    and user_id = auth.uid();
$$;
