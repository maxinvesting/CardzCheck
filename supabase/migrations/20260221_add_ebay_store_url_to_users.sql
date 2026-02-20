-- Migration: Add ebay_store_url to users for Sales Channels shortcut
-- Date: 2026-02-21

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'ebay_store_url'
  ) THEN
    ALTER TABLE public.users ADD COLUMN ebay_store_url TEXT;
  END IF;
END $$;
