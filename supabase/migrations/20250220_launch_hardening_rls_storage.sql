-- Migration: Harden RLS for subscriptions/usage/users and add storage policies
-- Date: 2025-02-20

-- ============================================
-- SUBSCRIPTIONS (server-managed)
-- ============================================
DO $$
BEGIN
  IF to_regclass('public.subscriptions') IS NOT NULL THEN
    ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

    -- Allow users to read their own subscription. Writes are server-only.
    DROP POLICY IF EXISTS "Users can view own subscription" ON public.subscriptions;
    DROP POLICY IF EXISTS "Users can read own subscription" ON public.subscriptions;
    CREATE POLICY "Users can read own subscription"
      ON public.subscriptions FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- ============================================
-- USAGE (server-managed counters)
-- ============================================
DO $$
BEGIN
  IF to_regclass('public.usage') IS NOT NULL THEN
    ALTER TABLE public.usage ENABLE ROW LEVEL SECURITY;

    -- Allow users to read their own usage. Writes are server-only.
    DROP POLICY IF EXISTS "Users can view own usage" ON public.usage;
    DROP POLICY IF EXISTS "Users can read own usage" ON public.usage;
    CREATE POLICY "Users can read own usage"
      ON public.usage FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- ============================================
-- USERS PROFILE TABLE (owner read/update only)
-- ============================================
DO $$
BEGIN
  IF to_regclass('public.users') IS NOT NULL THEN
    ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

    -- Owner can read their profile
    DROP POLICY IF EXISTS "Users can read own profile" ON public.users;
    CREATE POLICY "Users can read own profile"
      ON public.users FOR SELECT
      USING (auth.uid() = id);

    -- Owner can update their profile
    DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
    CREATE POLICY "Users can update own profile"
      ON public.users FOR UPDATE
      USING (auth.uid() = id)
      WITH CHECK (auth.uid() = id);

    -- No DELETE policy: deletion remains blocked by default.
  END IF;
END $$;

-- ============================================
-- STORAGE POLICIES FOR CARD IMAGES
-- ============================================
-- Scope to the card-images bucket and user-owned prefixes.
DO $$
BEGIN
  IF to_regclass('storage.objects') IS NOT NULL THEN
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Card images read own" ON storage.objects;
    CREATE POLICY "Card images read own"
      ON storage.objects FOR SELECT
      TO authenticated
      USING (
        bucket_id = 'card-images'
        AND name LIKE (auth.uid()::text || '/%')
      );

    DROP POLICY IF EXISTS "Card images insert own" ON storage.objects;
    CREATE POLICY "Card images insert own"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (
        bucket_id = 'card-images'
        AND name LIKE (auth.uid()::text || '/%')
      );

    DROP POLICY IF EXISTS "Card images update own" ON storage.objects;
    CREATE POLICY "Card images update own"
      ON storage.objects FOR UPDATE
      TO authenticated
      USING (
        bucket_id = 'card-images'
        AND name LIKE (auth.uid()::text || '/%')
      )
      WITH CHECK (
        bucket_id = 'card-images'
        AND name LIKE (auth.uid()::text || '/%')
      );

    DROP POLICY IF EXISTS "Card images delete own" ON storage.objects;
    CREATE POLICY "Card images delete own"
      ON storage.objects FOR DELETE
      TO authenticated
      USING (
        bucket_id = 'card-images'
        AND name LIKE (auth.uid()::text || '/%')
      );
  END IF;
END $$;
