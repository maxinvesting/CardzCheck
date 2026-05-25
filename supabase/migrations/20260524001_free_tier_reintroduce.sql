-- ============================================================================
-- PR C2a: Re-introduce Free as a first-class tier.
--
-- Decisions:
--   · New tier model is three values: 'free' | 'business' | 'business_pro'.
--   · Legacy 'pro' stays in the CHECK constraint (no rows currently have it,
--     but keep it allowed until a final cleanup migration).
--   · New subscription rows default to 'free' — most signups should land
--     here, not auto-upgraded to Business.
--   · Existing rows are NOT remapped. PR C1 already migrated free→business
--     and business→business_pro. Per product decision ("no real users yet")
--     we accept those rows as-is — they read as Business / Business Pro in
--     the access layer and won't be auto-downgraded.
--   · RPC consume_weekly_analyst_message: when it auto-creates a
--     subscription row for a brand-new user, it should create as 'free'
--     (not 'business'), matching the new default.
-- ============================================================================

-- 1. New rows default to 'free'.
ALTER TABLE public.subscriptions
  ALTER COLUMN tier SET DEFAULT 'free';

-- 2. Patch the analyst RPC to create new rows as 'free' (was 'business').
CREATE OR REPLACE FUNCTION public.consume_weekly_analyst_message(
  p_user_id UUID,
  p_weekly_limit INTEGER
) RETURNS BOOLEAN AS $$
DECLARE
  v_week_start TIMESTAMPTZ;
  v_count INTEGER;
BEGIN
  INSERT INTO public.subscriptions (user_id, tier)
  VALUES (p_user_id, 'free')
  ON CONFLICT (user_id) DO NOTHING;

  SELECT analyst_week_start, analyst_messages_this_week
  INTO v_week_start, v_count
  FROM public.subscriptions
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF v_week_start IS NULL OR v_week_start < NOW() - INTERVAL '7 days' THEN
    v_week_start := NOW();
    v_count := 0;
  END IF;

  IF p_weekly_limit > 0 AND v_count >= p_weekly_limit THEN
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
