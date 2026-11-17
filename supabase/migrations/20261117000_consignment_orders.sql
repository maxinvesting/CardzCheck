-- Consignment orders: batches of cards sent to a consignor (usually the ones that
-- didn't make the grading cut). Cards are picked from inventory or typed in by
-- hand. When the order settles, the net payout is split so every card takes an
-- equal share of the loss (or proportional to cost), and inventory cards are
-- recorded as sales.

create table if not exists public.consignment_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  business_account_id uuid not null references public.business_accounts(id) on delete cascade,
  consignor text not null,
  reference text,
  sent_date date not null default current_date,
  status text not null default 'open' check (status in ('open', 'settled')),
  split_method text not null default 'equal_loss' check (split_method in ('equal_loss', 'proportional')),
  payout_total_cents integer,
  settled_date date,
  misc_profit_id uuid,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists consignment_orders_account_idx
  on public.consignment_orders (business_account_id, sent_date desc);

create table if not exists public.consignment_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.consignment_orders(id) on delete cascade,
  business_account_id uuid not null references public.business_accounts(id) on delete cascade,
  -- Linked inventory row (collection_items). Null for cards added by hand.
  inventory_item_id uuid references public.collection_items(id) on delete set null,
  title text not null,
  card_number text,
  quantity integer not null default 1,
  cost_cents integer not null default 0,
  -- Inventory status before the card went to consignment; restored if removed.
  prior_status text,
  -- Filled on settlement.
  payout_cents integer,
  sale_id uuid,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists consignment_order_items_order_idx
  on public.consignment_order_items (order_id, position);
create index if not exists consignment_order_items_inventory_idx
  on public.consignment_order_items (inventory_item_id);

alter table public.consignment_orders enable row level security;
alter table public.consignment_order_items enable row level security;

drop policy if exists "Members manage consignment orders" on public.consignment_orders;
create policy "Members manage consignment orders"
  on public.consignment_orders for all
  using (private.is_business_member(business_account_id, auth.uid()))
  with check (private.is_business_member(business_account_id, auth.uid()));

drop policy if exists "Members manage consignment items" on public.consignment_order_items;
create policy "Members manage consignment items"
  on public.consignment_order_items for all
  using (private.is_business_member(business_account_id, auth.uid()))
  with check (private.is_business_member(business_account_id, auth.uid()));
