-- Manual "Consignment / Misc. profit" ledger entries that add to total profit
-- outside of sales and trades.
create table if not exists public.business_misc_profit (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  business_account_id uuid not null references public.business_accounts(id) on delete cascade,
  occurred_at date not null default current_date,
  amount_cents integer not null,
  label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists business_misc_profit_account_date_idx
  on public.business_misc_profit (business_account_id, occurred_at desc);

alter table public.business_misc_profit enable row level security;

create policy "Members can read misc profit"
  on public.business_misc_profit for select
  using (private.is_business_member(business_account_id, auth.uid()));

create policy "Members can insert misc profit"
  on public.business_misc_profit for insert
  with check (private.has_business_role(business_account_id, auth.uid(), array['owner','manager','employee']));

create policy "Members can update misc profit"
  on public.business_misc_profit for update
  using (private.has_business_role(business_account_id, auth.uid(), array['owner','manager','employee']))
  with check (private.has_business_role(business_account_id, auth.uid(), array['owner','manager','employee']));

create policy "Managers can delete misc profit"
  on public.business_misc_profit for delete
  using (private.has_business_role(business_account_id, auth.uid(), array['owner','manager']));
