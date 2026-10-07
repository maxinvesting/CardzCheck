-- Cards sent out for grading: new 'at_grading' inventory status plus the
-- submission details. Business inventory rows live in collection_items
-- (item_kind = 'inventory'). Business days remaining are derived at read time
-- from grading_sent_date + grading_turnaround_days.
alter table public.collection_items drop constraint if exists collection_items_status_check;
alter table public.collection_items add constraint collection_items_status_check
  check (status = any (array['unlisted','listed','pending_sale','at_grading','sold','returned','traded']));

alter table public.collection_items
  add column if not exists grading_submitted_company text,
  add column if not exists grading_service text,
  add column if not exists grading_fee_cents integer,
  add column if not exists grading_sent_date date,
  add column if not exists grading_turnaround_days integer
    check (grading_turnaround_days is null or grading_turnaround_days >= 0);
