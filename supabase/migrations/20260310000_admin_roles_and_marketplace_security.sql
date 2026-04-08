-- Migration: Admin roles, wallet linkage, and marketplace listing hardening
-- Date: 2026-03-10

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'role'
  ) THEN
    ALTER TABLE public.users
      ADD COLUMN role TEXT NOT NULL DEFAULT 'user';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_role_check'
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_role_check
      CHECK (role IN ('user', 'admin'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'wallet_address'
  ) THEN
    ALTER TABLE public.users
      ADD COLUMN wallet_address TEXT;
  END IF;
END $$;

UPDATE public.users
SET role = CASE
  WHEN app_role IN ('admin', 'owner') THEN 'admin'
  ELSE 'user'
END
WHERE role IS NULL
   OR role NOT IN ('user', 'admin');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_wallet_address_check'
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_wallet_address_check
      CHECK (
        wallet_address IS NULL
        OR wallet_address ~ '^0x[0-9a-f]{40}$'
      );
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_wallet_address_unique
  ON public.users (wallet_address)
  WHERE wallet_address IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_role
  ON public.users (role);

CREATE OR REPLACE FUNCTION public.guard_user_role_and_wallet_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.wallet_address IS NOT NULL THEN
    NEW.wallet_address := lower(trim(NEW.wallet_address));
  END IF;

  IF auth.role() <> 'service_role' THEN
    IF TG_OP = 'INSERT' THEN
      NEW.role := COALESCE(NEW.role, 'user');
      IF NEW.role <> 'user' THEN
        RAISE EXCEPTION 'Only service role can assign admin role';
      END IF;
    ELSIF NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'Only service role can change role';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_guard_role_and_wallet_updates ON public.users;
CREATE TRIGGER users_guard_role_and_wallet_updates
BEFORE INSERT OR UPDATE ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.guard_user_role_and_wallet_updates();

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

DROP POLICY IF EXISTS "Users can insert own profile" ON public.users;
CREATE POLICY "Users can insert own profile"
  ON public.users FOR INSERT
  WITH CHECK (auth.uid() = id);

REVOKE ALL ON TABLE public.users FROM anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.users TO authenticated;

ALTER TABLE public.skus
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS card_year TEXT,
  ADD COLUMN IF NOT EXISTS set_name TEXT,
  ADD COLUMN IF NOT EXISTS player_name TEXT,
  ADD COLUMN IF NOT EXISTS card_number TEXT,
  ADD COLUMN IF NOT EXISTS parallel TEXT,
  ADD COLUMN IF NOT EXISTS grade TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'skus_status_check'
  ) THEN
    ALTER TABLE public.skus
      ADD CONSTRAINT skus_status_check
      CHECK (status IN ('active', 'paused'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_skus_status_created_at
  ON public.skus (status, created_at DESC);

CREATE OR REPLACE FUNCTION public.touch_sku_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS skus_touch_updated_at ON public.skus;
CREATE TRIGGER skus_touch_updated_at
BEFORE UPDATE ON public.skus
FOR EACH ROW
EXECUTE FUNCTION public.touch_sku_updated_at();

CREATE OR REPLACE FUNCTION public.current_user_is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND (
        u.role = 'admin'
        OR u.app_role IN ('admin', 'owner')
      )
  );
$$;

REVOKE ALL ON FUNCTION public.current_user_is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_is_admin() TO authenticated;

ALTER TABLE public.skus ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sold_comps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.peg_updates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read active marketplace skus" ON public.skus;
CREATE POLICY "Public can read active marketplace skus"
  ON public.skus FOR SELECT
  USING (
    status = 'active'
    OR auth.role() = 'service_role'
    OR public.current_user_is_admin()
  );

DROP POLICY IF EXISTS "Public can read active sold comps" ON public.sold_comps;
CREATE POLICY "Public can read active sold comps"
  ON public.sold_comps FOR SELECT
  USING (
    auth.role() = 'service_role'
    OR public.current_user_is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.skus s
      WHERE s.sku_id = sold_comps.sku_id
        AND s.status = 'active'
    )
  );

DROP POLICY IF EXISTS "Public can read active peg updates" ON public.peg_updates;
CREATE POLICY "Public can read active peg updates"
  ON public.peg_updates FOR SELECT
  USING (
    auth.role() = 'service_role'
    OR public.current_user_is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.skus s
      WHERE s.sku_id = peg_updates.sku_id
        AND s.status = 'active'
    )
  );

REVOKE INSERT, UPDATE, DELETE ON TABLE public.skus FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.sold_comps FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.peg_updates FROM anon, authenticated;

GRANT SELECT ON TABLE public.skus TO anon, authenticated;
GRANT SELECT ON TABLE public.sold_comps TO anon, authenticated;
GRANT SELECT ON TABLE public.peg_updates TO anon, authenticated;
