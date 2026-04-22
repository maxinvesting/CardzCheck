-- Atomic reservations for monthly grade token budgets.
-- This prevents concurrent grade-start requests from overspending the user's cap.

CREATE TABLE IF NOT EXISTS grade_token_reservations (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_start       DATE NOT NULL,
  reserved_cost_cents INTEGER NOT NULL CHECK (reserved_cost_cents >= 0),
  status             TEXT NOT NULL CHECK (status IN ('reserved', 'settled', 'released')),
  input_tokens_used  BIGINT,
  output_tokens_used BIGINT,
  actual_cost_cents  INTEGER,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  settled_at         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS grade_token_reservations_user_period_status_idx
  ON grade_token_reservations (user_id, period_start, status);

ALTER TABLE grade_token_reservations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own grade token reservations" ON public.grade_token_reservations;
CREATE POLICY "Users can view own grade token reservations"
  ON grade_token_reservations FOR SELECT
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION reserve_grade_token_budget(
  p_user_id UUID,
  p_period_start DATE,
  p_budget_cents INTEGER
)
RETURNS TABLE (
  allowed BOOLEAN,
  reservation_id UUID,
  spent_cents INTEGER,
  reserved_cents INTEGER,
  remaining_cents INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_spent_cents INTEGER := 0;
  v_reserved_cents INTEGER := 0;
  v_available_cents INTEGER := 0;
  v_reservation_id UUID;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_user_id::text || ':' || p_period_start::text));

  SELECT COALESCE(cost_usd_cents, 0)
    INTO v_spent_cents
    FROM grade_token_usage
   WHERE user_id = p_user_id
     AND period_start = p_period_start;

  SELECT COALESCE(SUM(reserved_cost_cents), 0)::INTEGER
    INTO v_reserved_cents
    FROM grade_token_reservations
   WHERE user_id = p_user_id
     AND period_start = p_period_start
     AND status = 'reserved';

  v_available_cents := GREATEST(0, p_budget_cents - v_spent_cents - v_reserved_cents);

  IF v_available_cents <= 0 THEN
    RETURN QUERY
    SELECT FALSE, NULL::UUID, v_spent_cents, v_reserved_cents, 0;
    RETURN;
  END IF;

  INSERT INTO grade_token_reservations (
    user_id,
    period_start,
    reserved_cost_cents,
    status
  )
  VALUES (
    p_user_id,
    p_period_start,
    v_available_cents,
    'reserved'
  )
  RETURNING id INTO v_reservation_id;

  RETURN QUERY
  SELECT TRUE, v_reservation_id, v_spent_cents, v_reserved_cents + v_available_cents, 0;
END;
$$;

CREATE OR REPLACE FUNCTION settle_grade_token_budget_reservation(
  p_reservation_id UUID,
  p_input_tokens BIGINT,
  p_output_tokens BIGINT,
  p_actual_cost_cents INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_reservation grade_token_reservations%ROWTYPE;
BEGIN
  SELECT *
    INTO v_reservation
    FROM grade_token_reservations
   WHERE id = p_reservation_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext(v_reservation.user_id::text || ':' || v_reservation.period_start::text)
  );

  IF v_reservation.status <> 'reserved' THEN
    RETURN FALSE;
  END IF;

  INSERT INTO grade_token_usage (
    user_id,
    period_start,
    input_tokens_used,
    output_tokens_used,
    cost_usd_cents
  )
  VALUES (
    v_reservation.user_id,
    v_reservation.period_start,
    p_input_tokens,
    p_output_tokens,
    p_actual_cost_cents
  )
  ON CONFLICT (user_id, period_start)
  DO UPDATE SET
    input_tokens_used = grade_token_usage.input_tokens_used + EXCLUDED.input_tokens_used,
    output_tokens_used = grade_token_usage.output_tokens_used + EXCLUDED.output_tokens_used,
    cost_usd_cents = grade_token_usage.cost_usd_cents + EXCLUDED.cost_usd_cents,
    updated_at = NOW();

  UPDATE grade_token_reservations
     SET status = 'settled',
         input_tokens_used = p_input_tokens,
         output_tokens_used = p_output_tokens,
         actual_cost_cents = p_actual_cost_cents,
         updated_at = NOW(),
         settled_at = NOW()
   WHERE id = p_reservation_id;

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION release_grade_token_budget_reservation(
  p_reservation_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_reservation grade_token_reservations%ROWTYPE;
BEGIN
  SELECT *
    INTO v_reservation
    FROM grade_token_reservations
   WHERE id = p_reservation_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext(v_reservation.user_id::text || ':' || v_reservation.period_start::text)
  );

  IF v_reservation.status <> 'reserved' THEN
    RETURN FALSE;
  END IF;

  UPDATE grade_token_reservations
     SET status = 'released',
         updated_at = NOW(),
         settled_at = NOW()
   WHERE id = p_reservation_id;

  RETURN TRUE;
END;
$$;
