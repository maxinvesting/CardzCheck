-- Migration: Shop waitlist for email capture when no listings
-- Date: 2026-02-26

CREATE TABLE IF NOT EXISTS public.shop_waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shop_waitlist_email
  ON public.shop_waitlist (email);

ALTER TABLE public.shop_waitlist ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert (join waitlist)
DROP POLICY IF EXISTS "Anon can join waitlist" ON public.shop_waitlist;
CREATE POLICY "Anon can join waitlist"
  ON public.shop_waitlist FOR INSERT
  WITH CHECK (true);

-- No SELECT for anon (admin reads via service role)
