-- Migration: Ensure public.users exists and has columns required by CardzCheck Analyst
-- Safe to run: creates table only if missing; adds columns only if missing.
-- Date: 2025-02-01

-- Create public.users if it doesn't exist (minimal schema; other migrations may have created it)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  name TEXT,
  is_paid BOOLEAN DEFAULT FALSE,
  stripe_customer_id TEXT,
  free_searches_used INTEGER DEFAULT 0,
  analyst_queries_used INTEGER DEFAULT 0,
  plan_selected BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add analyst_queries_used if missing (table may already exist from another migration)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'analyst_queries_used'
  ) THEN
    ALTER TABLE public.users ADD COLUMN analyst_queries_used INTEGER DEFAULT 0;
  END IF;
END $$;

-- Add name if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'name'
  ) THEN
    ALTER TABLE public.users ADD COLUMN name TEXT;
  END IF;
END $$;

-- RLS: ensure users can read/update own row (id = auth.uid())
DO $$
BEGIN
  IF to_regclass('public.users') IS NOT NULL THEN
    ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Users can read own profile" ON public.users;
    CREATE POLICY "Users can read own profile"
      ON public.users FOR SELECT
      USING (auth.uid() = id);

    DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
    CREATE POLICY "Users can update own profile"
      ON public.users FOR UPDATE
      USING (auth.uid() = id)
      WITH CHECK (auth.uid() = id);

    -- Allow insert so signup/plan flow can create the row (e.g. id = auth.uid())
    DROP POLICY IF EXISTS "Users can insert own profile" ON public.users;
    CREATE POLICY "Users can insert own profile"
      ON public.users FOR INSERT
      WITH CHECK (auth.uid() = id);
  END IF;
END $$;
