-- ─────────────────────────────────────────────────────────────────────────────
-- Messaging tables for Business Mode customer support
-- Supports eBay (primary), Whatnot, website chat, and future platforms
-- ─────────────────────────────────────────────────────────────────────────────

-- Platform enum
create type message_platform as enum ('ebay', 'whatnot', 'website', 'other');

-- Thread status
create type thread_status as enum (
  'open',
  'needs_response',
  'awaiting_buyer',
  'resolved',
  'archived'
);

-- Message category / topic
create type message_category as enum (
  'question',
  'offer',
  'shipping',
  'complaint',
  'return_refund',
  'other'
);

-- Direction
create type message_direction as enum ('inbound', 'outbound');

-- ─── message_threads ────────────────────────────────────────────────────────

create table message_threads (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  platform      message_platform not null default 'ebay',
  external_thread_id text,

  -- buyer
  buyer_username      text not null,
  buyer_display_name  text,
  business_customer_id uuid,

  -- listing linkage
  listing_id        text,
  inventory_item_id uuid references collection_items(id) on delete set null,
  item_title        text,
  item_image_url    text,

  -- thread state
  status           thread_status not null default 'open',
  category         message_category not null default 'other',
  unread_count     int not null default 0,
  last_message_at  timestamptz not null default now(),
  last_message_preview text,

  -- AI
  ai_suggested_reply text,
  suggested_action   text, -- negotiation action recommendation

  -- negotiation snapshot (cents)
  offer_amount_cents    int,
  listing_price_cents   int,
  cost_basis_cents      int,
  fee_percent           numeric(5,2),
  estimated_net_cents   int,
  estimated_profit_cents int,
  suggested_counter_cents int,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index for fast user queries
create index idx_message_threads_user_id on message_threads(user_id);
create index idx_message_threads_status on message_threads(user_id, status);
create index idx_message_threads_last_message on message_threads(user_id, last_message_at desc);

-- RLS
alter table message_threads enable row level security;
create policy "Users can manage own threads"
  on message_threads for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ─── messages ────────────────────────────────────────────────────────────────

create table messages (
  id          uuid primary key default gen_random_uuid(),
  thread_id   uuid not null references message_threads(id) on delete cascade,
  direction   message_direction not null,
  sender_username text not null,
  body        text not null,
  is_read     boolean not null default false,
  external_message_id text,
  created_at  timestamptz not null default now()
);

create index idx_messages_thread_id on messages(thread_id, created_at);

-- RLS via thread ownership
alter table messages enable row level security;
create policy "Users can manage messages in own threads"
  on messages for all
  using (
    exists (
      select 1 from message_threads
      where message_threads.id = messages.thread_id
        and message_threads.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from message_threads
      where message_threads.id = messages.thread_id
        and message_threads.user_id = auth.uid()
    )
  );

-- ─── ai_reply_drafts ────────────────────────────────────────────────────────

create table ai_reply_drafts (
  id         uuid primary key default gen_random_uuid(),
  thread_id  uuid not null references message_threads(id) on delete cascade,
  tone       text not null default 'professional',
  body       text not null,
  created_at timestamptz not null default now()
);

alter table ai_reply_drafts enable row level security;
create policy "Users can manage AI drafts for own threads"
  on ai_reply_drafts for all
  using (
    exists (
      select 1 from message_threads
      where message_threads.id = ai_reply_drafts.thread_id
        and message_threads.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from message_threads
      where message_threads.id = ai_reply_drafts.thread_id
        and message_threads.user_id = auth.uid()
    )
  );

-- ─── Updated_at trigger ─────────────────────────────────────────────────────

create or replace function update_message_thread_timestamp()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_message_threads_updated_at
  before update on message_threads
  for each row execute function update_message_thread_timestamp();
