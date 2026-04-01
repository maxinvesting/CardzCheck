-- Grade Scan Credits: free-tier weekly scan allowance
-- Free users start with 2 credits and receive 1 new credit each week.

CREATE TABLE IF NOT EXISTS grade_scan_credits (
  user_id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  credits_remaining    INT  NOT NULL DEFAULT 2 CHECK (credits_remaining >= 0),
  last_weekly_grant_at TIMESTAMP WITH TIME ZONE,
  created_at           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

ALTER TABLE grade_scan_credits ENABLE ROW LEVEL SECURITY;

-- Users can read their own credits row
CREATE POLICY "grade_scan_credits_select_own"
  ON grade_scan_credits FOR SELECT
  USING (auth.uid() = user_id);

-- Service role manages all rows (no user-facing write policy)
CREATE POLICY "grade_scan_credits_service_all"
  ON grade_scan_credits FOR ALL
  USING (true)
  WITH CHECK (true);

-- Function: atomically consume one credit; returns TRUE if successful.
-- Uses SECURITY DEFINER so it can always update the row even though
-- users have no write RLS policy on this table.
CREATE OR REPLACE FUNCTION consume_grade_scan_credit(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_remaining INT;
BEGIN
  -- Ensure row exists (first-time free user)
  INSERT INTO grade_scan_credits (user_id, credits_remaining)
  VALUES (p_user_id, 2)
  ON CONFLICT (user_id) DO NOTHING;

  -- Atomically decrement (only if > 0)
  UPDATE grade_scan_credits
  SET
    credits_remaining = credits_remaining - 1,
    updated_at        = NOW()
  WHERE user_id = p_user_id
    AND credits_remaining > 0
  RETURNING credits_remaining INTO v_remaining;

  RETURN v_remaining IS NOT NULL; -- TRUE if a row was updated
END;
$$;

-- Function: apply weekly grant (idempotent — safe to call on every credit check).
-- Adds 1 credit (up to max 2) if ≥7 days since last grant.
CREATE OR REPLACE FUNCTION apply_weekly_grade_credit(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Ensure row exists
  INSERT INTO grade_scan_credits (user_id, credits_remaining)
  VALUES (p_user_id, 2)
  ON CONFLICT (user_id) DO NOTHING;

  UPDATE grade_scan_credits
  SET
    credits_remaining    = LEAST(credits_remaining + 1, 2),
    last_weekly_grant_at = NOW(),
    updated_at           = NOW()
  WHERE user_id = p_user_id
    AND (
      last_weekly_grant_at IS NULL
      OR last_weekly_grant_at < NOW() - INTERVAL '7 days'
    );
END;
$$;
