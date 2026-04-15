-- Per-user monthly token usage tracking for the Grade Probability Engine.
-- Costs are stored in integer cents to avoid floating-point drift.

CREATE TABLE IF NOT EXISTS grade_token_usage (
  id              UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         UUID    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_start    DATE    NOT NULL,                    -- always the 1st of the month (UTC)
  input_tokens_used  BIGINT  NOT NULL DEFAULT 0,
  output_tokens_used BIGINT  NOT NULL DEFAULT 0,
  cost_usd_cents  INTEGER NOT NULL DEFAULT 0,          -- e.g. 47 = $0.47
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT grade_token_usage_user_period UNIQUE (user_id, period_start)
);
-- Users can read their own usage (e.g. for a budget indicator in the UI)
ALTER TABLE grade_token_usage ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own grade token usage" ON public.grade_token_usage;
CREATE POLICY "Users can view own grade token usage"
  ON grade_token_usage FOR SELECT
  USING (auth.uid() = user_id);
-- Atomic upsert — avoids read-modify-write races when two jobs finish simultaneously.
-- Called from server-side only (SECURITY DEFINER so it bypasses RLS).
CREATE OR REPLACE FUNCTION increment_grade_token_usage(
  p_user_id          UUID,
  p_period_start     DATE,
  p_input_tokens     BIGINT,
  p_output_tokens    BIGINT,
  p_cost_cents       INTEGER
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO grade_token_usage
    (user_id, period_start, input_tokens_used, output_tokens_used, cost_usd_cents)
  VALUES
    (p_user_id, p_period_start, p_input_tokens, p_output_tokens, p_cost_cents)
  ON CONFLICT (user_id, period_start)
  DO UPDATE SET
    input_tokens_used  = grade_token_usage.input_tokens_used  + EXCLUDED.input_tokens_used,
    output_tokens_used = grade_token_usage.output_tokens_used + EXCLUDED.output_tokens_used,
    cost_usd_cents     = grade_token_usage.cost_usd_cents     + EXCLUDED.cost_usd_cents,
    updated_at         = NOW();
END;
$$;
