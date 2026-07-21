-- Trade fees are now expensed into realized P&L at trade time (received − paid −
-- fees), rather than capitalized into the received cards' cost basis. Store the
-- fee on the trade so recognition can subtract it.
alter table public.business_trades
  add column if not exists fees_cents integer not null default 0;

comment on column public.business_trades.fees_cents is
  'Trade fee paid (e.g. online platform fee), expensed into realized P&L at trade time — not capitalized into received-card basis.';
