-- Migration: Add app-level admin roles on public.users
-- Date: 2026-02-27

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'app_role'
  ) THEN
    ALTER TABLE public.users
      ADD COLUMN app_role TEXT NOT NULL DEFAULT 'member';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_app_role_check'
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_app_role_check
      CHECK (app_role IN ('member', 'admin', 'owner'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_users_app_role
  ON public.users (app_role);
