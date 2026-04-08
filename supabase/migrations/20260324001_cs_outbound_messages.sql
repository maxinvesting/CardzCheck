-- Lightweight store for outbound messages sent via CardzCheck.
-- eBay's API does not return seller-sent messages, so we persist them here
-- and merge them with inbound eBay messages when loading a thread.

create table if not exists cs_outbound_messages (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  ebay_thread_id  text not null,          -- e.g. "ebay-msg-thread-..." or "ebay-inquiry-..."
  sender_username text not null,
  body            text not null,
  created_at      timestamptz not null default now()
);

create index idx_cs_outbound_messages_thread
  on cs_outbound_messages(user_id, ebay_thread_id, created_at);

alter table cs_outbound_messages enable row level security;

create policy "Users can manage own outbound messages"
  on cs_outbound_messages for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
