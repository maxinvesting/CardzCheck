-- Migration: Business teams, seats, and team-scoped core business data
-- Date: 2026-03-24

-- Keep canonical updated_at trigger helper available.
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 1) TEAM / ACCOUNT TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS public.business_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text,
  billing_interval text NOT NULL DEFAULT 'monthly'
    CHECK (billing_interval IN ('monthly')),
  subscription_status text NOT NULL DEFAULT 'active',
  current_period_end timestamptz,
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_subscription_item_id text,
  seats_included int NOT NULL DEFAULT 1,
  seat_quantity int NOT NULL DEFAULT 1,
  purchased_seats int GENERATED ALWAYS AS (GREATEST(seat_quantity - seats_included, 0)) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT business_accounts_owner_unique UNIQUE (owner_user_id),
  CONSTRAINT business_accounts_seat_bounds CHECK (seats_included >= 1 AND seat_quantity >= seats_included)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_business_accounts_stripe_subscription
  ON public.business_accounts (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_business_accounts_stripe_customer
  ON public.business_accounts (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.business_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_account_id uuid NOT NULL REFERENCES public.business_accounts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner', 'manager', 'employee')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  joined_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT business_memberships_account_user_unique UNIQUE (business_account_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_business_memberships_user
  ON public.business_memberships (user_id, status);

CREATE INDEX IF NOT EXISTS idx_business_memberships_account_status
  ON public.business_memberships (business_account_id, status);

CREATE TABLE IF NOT EXISTS public.business_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_account_id uuid NOT NULL REFERENCES public.business_accounts(id) ON DELETE CASCADE,
  email text NOT NULL,
  email_normalized text NOT NULL,
  role text NOT NULL CHECK (role IN ('manager', 'employee')),
  token_hash text NOT NULL,
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  accepted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT business_invites_token_hash_unique UNIQUE (token_hash)
);

CREATE INDEX IF NOT EXISTS idx_business_invites_account_active
  ON public.business_invites (business_account_id, created_at DESC)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_business_invites_account_email_active
  ON public.business_invites (business_account_id, email_normalized)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

-- ============================================================
-- 2) TEAM HELPER FUNCTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION public.normalize_email(value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(trim(COALESCE(value, '')));
$$;

CREATE OR REPLACE FUNCTION public.is_business_member(
  p_business_account_id uuid,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.business_memberships m
    WHERE m.business_account_id = p_business_account_id
      AND m.user_id = p_user_id
      AND m.status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.has_business_role(
  p_business_account_id uuid,
  p_user_id uuid,
  p_roles text[]
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.business_memberships m
    WHERE m.business_account_id = p_business_account_id
      AND m.user_id = p_user_id
      AND m.status = 'active'
      AND m.role = ANY (p_roles)
  );
$$;

CREATE OR REPLACE FUNCTION public.current_business_account_id(p_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.business_account_id
  FROM public.business_memberships m
  WHERE m.user_id = p_user_id
    AND m.status = 'active'
  ORDER BY
    CASE m.role WHEN 'owner' THEN 0 WHEN 'manager' THEN 1 ELSE 2 END,
    m.joined_at ASC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.is_business_member(uuid, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_business_role(uuid, uuid, text[]) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_business_account_id(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.normalize_email(text) TO anon, authenticated, service_role;

-- ============================================================
-- 3) TIMESTAMP TRIGGERS
-- ============================================================

DROP TRIGGER IF EXISTS update_business_accounts_updated_at ON public.business_accounts;
CREATE TRIGGER update_business_accounts_updated_at
  BEFORE UPDATE ON public.business_accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_business_memberships_updated_at ON public.business_memberships;
CREATE TRIGGER update_business_memberships_updated_at
  BEFORE UPDATE ON public.business_memberships
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_business_invites_updated_at ON public.business_invites;
CREATE TRIGGER update_business_invites_updated_at
  BEFORE UPDATE ON public.business_invites
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.sync_business_invite_normalized_email()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.email_normalized := public.normalize_email(NEW.email);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_business_invites_normalize_email ON public.business_invites;
CREATE TRIGGER trg_business_invites_normalize_email
  BEFORE INSERT OR UPDATE ON public.business_invites
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_business_invite_normalized_email();

-- ============================================================
-- 4) BACKFILL BUSINESS ACCOUNTS + OWNER MEMBERSHIPS
-- ============================================================

WITH candidate_owners AS (
  SELECT DISTINCT s.user_id AS owner_user_id
  FROM public.subscriptions s
  WHERE s.tier = 'business'

  UNION

  SELECT DISTINCT bi.user_id AS owner_user_id
  FROM public.business_inventory_items bi

  UNION

  SELECT DISTINCT COALESCE(bs.business_id, bs.user_id) AS owner_user_id
  FROM public.business_sales bs

  UNION

  SELECT DISTINCT bc.user_id AS owner_user_id
  FROM public.business_consultations bc
)
INSERT INTO public.business_accounts (
  owner_user_id,
  name,
  subscription_status,
  current_period_end,
  stripe_customer_id,
  stripe_subscription_id,
  seats_included,
  seat_quantity
)
SELECT
  co.owner_user_id,
  NULLIF(TRIM(u.business_name), ''),
  COALESCE(s.status, 'active'),
  s.current_period_end,
  s.stripe_customer_id,
  s.stripe_subscription_id,
  1,
  1
FROM candidate_owners co
LEFT JOIN public.users u ON u.id = co.owner_user_id
LEFT JOIN public.subscriptions s ON s.user_id = co.owner_user_id
ON CONFLICT (owner_user_id) DO UPDATE SET
  name = COALESCE(EXCLUDED.name, public.business_accounts.name),
  subscription_status = COALESCE(EXCLUDED.subscription_status, public.business_accounts.subscription_status),
  current_period_end = COALESCE(EXCLUDED.current_period_end, public.business_accounts.current_period_end),
  stripe_customer_id = COALESCE(EXCLUDED.stripe_customer_id, public.business_accounts.stripe_customer_id),
  stripe_subscription_id = COALESCE(EXCLUDED.stripe_subscription_id, public.business_accounts.stripe_subscription_id),
  updated_at = now();

INSERT INTO public.business_memberships (
  business_account_id,
  user_id,
  role,
  status,
  invited_by,
  joined_at
)
SELECT
  ba.id,
  ba.owner_user_id,
  'owner',
  'active',
  ba.owner_user_id,
  ba.created_at
FROM public.business_accounts ba
ON CONFLICT (business_account_id, user_id)
DO UPDATE SET
  role = 'owner',
  status = 'active',
  updated_at = now();

-- ============================================================
-- 5) CORE BUSINESS TABLES => TEAM-SCOPED
-- ============================================================

ALTER TABLE public.business_inventory_items
  ADD COLUMN IF NOT EXISTS business_account_id uuid REFERENCES public.business_accounts(id) ON DELETE CASCADE;

ALTER TABLE public.business_sales
  ADD COLUMN IF NOT EXISTS business_account_id uuid REFERENCES public.business_accounts(id) ON DELETE CASCADE;

ALTER TABLE public.business_consultations
  ADD COLUMN IF NOT EXISTS business_account_id uuid REFERENCES public.business_accounts(id) ON DELETE CASCADE;

UPDATE public.business_inventory_items bi
SET business_account_id = ba.id
FROM public.business_accounts ba
WHERE bi.business_account_id IS NULL
  AND ba.owner_user_id = bi.user_id;

UPDATE public.business_sales bs
SET business_account_id = ba.id
FROM public.business_accounts ba
WHERE bs.business_account_id IS NULL
  AND ba.owner_user_id = COALESCE(bs.business_id, bs.user_id);

UPDATE public.business_consultations bc
SET business_account_id = ba.id
FROM public.business_accounts ba
WHERE bc.business_account_id IS NULL
  AND ba.owner_user_id = bc.user_id;

CREATE INDEX IF NOT EXISTS idx_business_inventory_account_status
  ON public.business_inventory_items (business_account_id, status);

CREATE INDEX IF NOT EXISTS idx_business_sales_account_sold_at
  ON public.business_sales (business_account_id, sold_at DESC)
  WHERE is_deleted = false;

CREATE INDEX IF NOT EXISTS idx_business_consultations_account_updated
  ON public.business_consultations (business_account_id, updated_at DESC);

CREATE OR REPLACE FUNCTION public.sync_business_account_id_from_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  owner_id uuid;
BEGIN
  IF NEW.business_account_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  owner_id := NULL;

  IF TG_TABLE_NAME = 'business_sales' THEN
    owner_id := COALESCE(NEW.business_id, NEW.user_id);
  ELSE
    owner_id := NEW.user_id;
  END IF;

  IF owner_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT ba.id INTO NEW.business_account_id
  FROM public.business_accounts ba
  WHERE ba.owner_user_id = owner_id
  LIMIT 1;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_business_inventory_sync_account ON public.business_inventory_items;
CREATE TRIGGER trg_business_inventory_sync_account
  BEFORE INSERT OR UPDATE ON public.business_inventory_items
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_business_account_id_from_owner();

DROP TRIGGER IF EXISTS trg_business_sales_sync_account ON public.business_sales;
CREATE TRIGGER trg_business_sales_sync_account
  BEFORE INSERT OR UPDATE ON public.business_sales
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_business_account_id_from_owner();

DROP TRIGGER IF EXISTS trg_business_consultations_sync_account ON public.business_consultations;
CREATE TRIGGER trg_business_consultations_sync_account
  BEFORE INSERT OR UPDATE ON public.business_consultations
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_business_account_id_from_owner();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.business_inventory_items WHERE business_account_id IS NULL
  ) THEN
    ALTER TABLE public.business_inventory_items
      ALTER COLUMN business_account_id SET NOT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.business_sales WHERE business_account_id IS NULL
  ) THEN
    ALTER TABLE public.business_sales
      ALTER COLUMN business_account_id SET NOT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.business_consultations WHERE business_account_id IS NULL
  ) THEN
    ALTER TABLE public.business_consultations
      ALTER COLUMN business_account_id SET NOT NULL;
  END IF;
END $$;

-- ============================================================
-- 6) RLS
-- ============================================================

ALTER TABLE public.business_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_consultations ENABLE ROW LEVEL SECURITY;

-- business_accounts
DROP POLICY IF EXISTS "Members can read business account" ON public.business_accounts;
CREATE POLICY "Members can read business account"
  ON public.business_accounts FOR SELECT
  USING (public.is_business_member(id, auth.uid()));

DROP POLICY IF EXISTS "Owner can create business account" ON public.business_accounts;
CREATE POLICY "Owner can create business account"
  ON public.business_accounts FOR INSERT
  WITH CHECK (owner_user_id = auth.uid());

DROP POLICY IF EXISTS "Owner can update business account" ON public.business_accounts;
CREATE POLICY "Owner can update business account"
  ON public.business_accounts FOR UPDATE
  USING (public.has_business_role(id, auth.uid(), ARRAY['owner']))
  WITH CHECK (public.has_business_role(id, auth.uid(), ARRAY['owner']));

DROP POLICY IF EXISTS "Owner can delete business account" ON public.business_accounts;
CREATE POLICY "Owner can delete business account"
  ON public.business_accounts FOR DELETE
  USING (public.has_business_role(id, auth.uid(), ARRAY['owner']));

-- business_memberships
DROP POLICY IF EXISTS "Members can read memberships" ON public.business_memberships;
CREATE POLICY "Members can read memberships"
  ON public.business_memberships FOR SELECT
  USING (public.is_business_member(business_account_id, auth.uid()));

DROP POLICY IF EXISTS "Owner or manager can insert memberships" ON public.business_memberships;
CREATE POLICY "Owner or manager can insert memberships"
  ON public.business_memberships FOR INSERT
  WITH CHECK (
    public.has_business_role(business_account_id, auth.uid(), ARRAY['owner'])
    OR (
      public.has_business_role(business_account_id, auth.uid(), ARRAY['manager'])
      AND role = 'employee'
    )
  );

DROP POLICY IF EXISTS "Owner or manager can update memberships" ON public.business_memberships;
CREATE POLICY "Owner or manager can update memberships"
  ON public.business_memberships FOR UPDATE
  USING (
    public.has_business_role(business_account_id, auth.uid(), ARRAY['owner'])
    OR (
      public.has_business_role(business_account_id, auth.uid(), ARRAY['manager'])
      AND role = 'employee'
    )
  )
  WITH CHECK (
    public.has_business_role(business_account_id, auth.uid(), ARRAY['owner'])
    OR (
      public.has_business_role(business_account_id, auth.uid(), ARRAY['manager'])
      AND role = 'employee'
    )
  );

DROP POLICY IF EXISTS "Owner or manager can delete memberships" ON public.business_memberships;
CREATE POLICY "Owner or manager can delete memberships"
  ON public.business_memberships FOR DELETE
  USING (
    public.has_business_role(business_account_id, auth.uid(), ARRAY['owner'])
    OR (
      public.has_business_role(business_account_id, auth.uid(), ARRAY['manager'])
      AND role = 'employee'
    )
  );

-- business_invites
DROP POLICY IF EXISTS "Members can read invites" ON public.business_invites;
CREATE POLICY "Members can read invites"
  ON public.business_invites FOR SELECT
  USING (public.is_business_member(business_account_id, auth.uid()));

DROP POLICY IF EXISTS "Owner or manager can insert invites" ON public.business_invites;
CREATE POLICY "Owner or manager can insert invites"
  ON public.business_invites FOR INSERT
  WITH CHECK (
    public.has_business_role(business_account_id, auth.uid(), ARRAY['owner'])
    OR (
      public.has_business_role(business_account_id, auth.uid(), ARRAY['manager'])
      AND role = 'employee'
    )
  );

DROP POLICY IF EXISTS "Owner or manager can update invites" ON public.business_invites;
CREATE POLICY "Owner or manager can update invites"
  ON public.business_invites FOR UPDATE
  USING (
    public.has_business_role(business_account_id, auth.uid(), ARRAY['owner'])
    OR (
      public.has_business_role(business_account_id, auth.uid(), ARRAY['manager'])
      AND role = 'employee'
    )
  )
  WITH CHECK (
    public.has_business_role(business_account_id, auth.uid(), ARRAY['owner'])
    OR (
      public.has_business_role(business_account_id, auth.uid(), ARRAY['manager'])
      AND role = 'employee'
    )
  );

DROP POLICY IF EXISTS "Owner or manager can delete invites" ON public.business_invites;
CREATE POLICY "Owner or manager can delete invites"
  ON public.business_invites FOR DELETE
  USING (
    public.has_business_role(business_account_id, auth.uid(), ARRAY['owner'])
    OR (
      public.has_business_role(business_account_id, auth.uid(), ARRAY['manager'])
      AND role = 'employee'
    )
  );

-- business_inventory_items
DROP POLICY IF EXISTS "Users can read own inventory" ON public.business_inventory_items;
DROP POLICY IF EXISTS "Users can insert own inventory" ON public.business_inventory_items;
DROP POLICY IF EXISTS "Users can update own inventory" ON public.business_inventory_items;
DROP POLICY IF EXISTS "Users can delete own inventory" ON public.business_inventory_items;
DROP POLICY IF EXISTS "Members can read business inventory" ON public.business_inventory_items;
DROP POLICY IF EXISTS "Members can insert business inventory" ON public.business_inventory_items;
DROP POLICY IF EXISTS "Members can update business inventory" ON public.business_inventory_items;
DROP POLICY IF EXISTS "Managers can delete business inventory" ON public.business_inventory_items;

CREATE POLICY "Members can read business inventory"
  ON public.business_inventory_items FOR SELECT
  USING (public.is_business_member(business_account_id, auth.uid()));

CREATE POLICY "Members can insert business inventory"
  ON public.business_inventory_items FOR INSERT
  WITH CHECK (public.has_business_role(business_account_id, auth.uid(), ARRAY['owner', 'manager', 'employee']));

CREATE POLICY "Members can update business inventory"
  ON public.business_inventory_items FOR UPDATE
  USING (public.has_business_role(business_account_id, auth.uid(), ARRAY['owner', 'manager', 'employee']))
  WITH CHECK (public.has_business_role(business_account_id, auth.uid(), ARRAY['owner', 'manager', 'employee']));

CREATE POLICY "Managers can delete business inventory"
  ON public.business_inventory_items FOR DELETE
  USING (public.has_business_role(business_account_id, auth.uid(), ARRAY['owner', 'manager']));

-- business_sales
DROP POLICY IF EXISTS "Users can read own sales" ON public.business_sales;
DROP POLICY IF EXISTS "Users can insert own sales" ON public.business_sales;
DROP POLICY IF EXISTS "Users can update own sales" ON public.business_sales;
DROP POLICY IF EXISTS "Users can delete own sales" ON public.business_sales;
DROP POLICY IF EXISTS "Members can read business sales" ON public.business_sales;
DROP POLICY IF EXISTS "Members can insert business sales" ON public.business_sales;
DROP POLICY IF EXISTS "Members can update business sales" ON public.business_sales;
DROP POLICY IF EXISTS "Managers can delete business sales" ON public.business_sales;

CREATE POLICY "Members can read business sales"
  ON public.business_sales FOR SELECT
  USING (public.is_business_member(business_account_id, auth.uid()));

CREATE POLICY "Members can insert business sales"
  ON public.business_sales FOR INSERT
  WITH CHECK (public.has_business_role(business_account_id, auth.uid(), ARRAY['owner', 'manager', 'employee']));

CREATE POLICY "Members can update business sales"
  ON public.business_sales FOR UPDATE
  USING (public.has_business_role(business_account_id, auth.uid(), ARRAY['owner', 'manager', 'employee']))
  WITH CHECK (public.has_business_role(business_account_id, auth.uid(), ARRAY['owner', 'manager', 'employee']));

CREATE POLICY "Managers can delete business sales"
  ON public.business_sales FOR DELETE
  USING (public.has_business_role(business_account_id, auth.uid(), ARRAY['owner', 'manager']));

-- business_consultations
DROP POLICY IF EXISTS "Users can view own business consultations" ON public.business_consultations;
DROP POLICY IF EXISTS "Users can create own business consultations" ON public.business_consultations;
DROP POLICY IF EXISTS "Users can update own business consultations" ON public.business_consultations;
DROP POLICY IF EXISTS "Users can delete own business consultations" ON public.business_consultations;
DROP POLICY IF EXISTS "Members can read business consultations" ON public.business_consultations;
DROP POLICY IF EXISTS "Members can insert business consultations" ON public.business_consultations;
DROP POLICY IF EXISTS "Members can update business consultations" ON public.business_consultations;
DROP POLICY IF EXISTS "Members can delete business consultations" ON public.business_consultations;

CREATE POLICY "Members can read business consultations"
  ON public.business_consultations FOR SELECT
  USING (public.is_business_member(business_account_id, auth.uid()));

CREATE POLICY "Members can insert business consultations"
  ON public.business_consultations FOR INSERT
  WITH CHECK (public.has_business_role(business_account_id, auth.uid(), ARRAY['owner', 'manager', 'employee']));

CREATE POLICY "Members can update business consultations"
  ON public.business_consultations FOR UPDATE
  USING (public.has_business_role(business_account_id, auth.uid(), ARRAY['owner', 'manager', 'employee']))
  WITH CHECK (public.has_business_role(business_account_id, auth.uid(), ARRAY['owner', 'manager', 'employee']));

CREATE POLICY "Members can delete business consultations"
  ON public.business_consultations FOR DELETE
  USING (public.has_business_role(business_account_id, auth.uid(), ARRAY['owner', 'manager', 'employee']));
