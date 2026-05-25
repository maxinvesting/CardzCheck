-- ============================================================================
-- PR C1: Collapse subscription tiers to {business, business_pro}.
--
-- Mapping (one-time, idempotent):
--   pro       → business
--   business  → business_pro
--   free      → business              (per product decision: everyone is
--                                       at least Business; pricing TBD)
--
-- Also adds a rolling 7-day analyst message counter to subscriptions, so the
-- Business tier (3 msgs/wk) can be enforced cheaply server-side.
-- ============================================================================

-- 1. Allow the new enum value, keep legacy values during transition so older
--    rows that haven't been migrated still validate.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'subscriptions_tier_check'
      AND conrelid = 'public.subscriptions'::regclass
  ) THEN
    ALTER TABLE public.subscriptions DROP CONSTRAINT subscriptions_tier_check;
  END IF;

  ALTER TABLE public.subscriptions
    ADD CONSTRAINT subscriptions_tier_check
    CHECK (tier IN ('free', 'pro', 'business', 'business_pro'));
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

-- 2. Remap existing rows.
UPDATE public.subscriptions
SET tier = 'business_pro',
    updated_at = NOW()
WHERE tier = 'business';

UPDATE public.subscriptions
SET tier = 'business',
    updated_at = NOW()
WHERE tier = 'pro';

UPDATE public.subscriptions
SET tier = 'business',
    updated_at = NOW()
WHERE tier = 'free';

-- 3. Add rolling 7-day analyst counter columns.
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS analyst_week_start TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS analyst_messages_this_week INTEGER NOT NULL DEFAULT 0;

-- 4. Atomic RPC: try to consume one analyst message for the given user.
--    Resets the weekly counter if the current week_start is null or older
--    than 7 days. Returns TRUE if the message was allowed (and counter
--    incremented), FALSE if the weekly limit was hit.
--
--    p_weekly_limit = 0 means unlimited (caller passes 0 for business_pro).
CREATE OR REPLACE FUNCTION public.consume_weekly_analyst_message(
  p_user_id UUID,
  p_weekly_limit INTEGER
) RETURNS BOOLEAN AS $$
DECLARE
  v_week_start TIMESTAMPTZ;
  v_count INTEGER;
BEGIN
  -- Ensure a subscription row exists for this user; create one as 'business'
  -- if missing (matches the new default tier).
  INSERT INTO public.subscriptions (user_id, tier)
  VALUES (p_user_id, 'business')
  ON CONFLICT (user_id) DO NOTHING;

  -- Read current counter state with row lock to prevent races.
  SELECT analyst_week_start, analyst_messages_this_week
  INTO v_week_start, v_count
  FROM public.subscriptions
  WHERE user_id = p_user_id
  FOR UPDATE;

  -- Reset window if first use or past the 7-day boundary.
  IF v_week_start IS NULL OR v_week_start < NOW() - INTERVAL '7 days' THEN
    v_week_start := NOW();
    v_count := 0;
  END IF;

  -- Unlimited path: 0 means caller doesn't want a limit.
  IF p_weekly_limit > 0 AND v_count >= p_weekly_limit THEN
    -- Don't increment; just persist (possibly reset) window for visibility.
    UPDATE public.subscriptions
    SET analyst_week_start = v_week_start,
        analyst_messages_this_week = v_count,
        updated_at = NOW()
    WHERE user_id = p_user_id;
    RETURN FALSE;
  END IF;

  v_count := v_count + 1;

  UPDATE public.subscriptions
  SET analyst_week_start = v_week_start,
      analyst_messages_this_week = v_count,
      updated_at = NOW()
  WHERE user_id = p_user_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- 5. Helper: read current weekly counter state without consuming.
CREATE OR REPLACE FUNCTION public.get_weekly_analyst_usage(
  p_user_id UUID
) RETURNS TABLE (
  messages_used INTEGER,
  week_start TIMESTAMPTZ,
  resets_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(s.analyst_messages_this_week, 0) AS messages_used,
    s.analyst_week_start AS week_start,
    CASE
      WHEN s.analyst_week_start IS NULL THEN NULL
      ELSE s.analyst_week_start + INTERVAL '7 days'
    END AS resets_at
  FROM public.subscriptions s
  WHERE s.user_id = p_user_id;
END;
$$ LANGUAGE plpgsql STABLE;

-- Note: legacy enum values ('free', 'pro') stay in the CHECK constraint until
-- a follow-up migration drops them, so any forgotten code path that writes
-- 'pro' or 'free' still validates. That cleanup ships in PR C2.
