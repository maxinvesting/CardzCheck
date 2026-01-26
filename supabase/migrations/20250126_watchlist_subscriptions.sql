-- Migration: Add watchlist, subscriptions, and usage tables
-- Date: 2025-01-26

-- Create updated_at trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- WATCHLIST TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS watchlist (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  player_name TEXT NOT NULL,
  year TEXT,
  set_brand TEXT,
  card_number TEXT,
  parallel_variant TEXT,
  condition TEXT,
  target_price DECIMAL(10,2),
  last_price DECIMAL(10,2),
  last_checked TIMESTAMPTZ,
  price_history JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indexes for watchlist
CREATE INDEX IF NOT EXISTS idx_watchlist_user_id ON watchlist(user_id);
CREATE INDEX IF NOT EXISTS idx_watchlist_last_checked ON watchlist(last_checked);

-- Trigger for updated_at on watchlist
DROP TRIGGER IF EXISTS update_watchlist_updated_at ON watchlist;
CREATE TRIGGER update_watchlist_updated_at
  BEFORE UPDATE ON watchlist
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS for watchlist
ALTER TABLE watchlist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own watchlist items" ON watchlist;
CREATE POLICY "Users can view own watchlist items"
  ON watchlist FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create own watchlist items" ON watchlist;
CREATE POLICY "Users can create own watchlist items"
  ON watchlist FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own watchlist items" ON watchlist;
CREATE POLICY "Users can update own watchlist items"
  ON watchlist FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own watchlist items" ON watchlist;
CREATE POLICY "Users can delete own watchlist items"
  ON watchlist FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- SUBSCRIPTIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tier TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'pro')),
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  activation_paid BOOLEAN DEFAULT FALSE,
  current_period_end TIMESTAMPTZ,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'past_due', 'canceled', 'unpaid')),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  CONSTRAINT subscriptions_user_id_unique UNIQUE(user_id)
);

-- Indexes for subscriptions
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_subscription_id ON subscriptions(stripe_subscription_id);

-- Trigger for updated_at on subscriptions
DROP TRIGGER IF EXISTS update_subscriptions_updated_at ON subscriptions;
CREATE TRIGGER update_subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS for subscriptions
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own subscription" ON subscriptions;
CREATE POLICY "Users can view own subscription"
  ON subscriptions FOR SELECT
  USING (auth.uid() = user_id);

-- ============================================
-- USAGE TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS usage (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  searches_used INTEGER DEFAULT 0,
  ai_messages_used INTEGER DEFAULT 0,
  period_start TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  last_reset TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  CONSTRAINT usage_user_id_unique UNIQUE(user_id)
);

-- Indexes for usage
CREATE INDEX IF NOT EXISTS idx_usage_user_id ON usage(user_id);

-- RLS for usage
ALTER TABLE usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own usage" ON usage;
CREATE POLICY "Users can view own usage"
  ON usage FOR SELECT
  USING (auth.uid() = user_id);

-- ============================================
-- MIGRATE EXISTING PAID USERS
-- ============================================
-- Create subscription records for existing paid users with 'past_due' status
-- They get activation_paid=true since they already paid $20
-- past_due indicates they need to set up recurring billing
INSERT INTO subscriptions (user_id, tier, stripe_customer_id, activation_paid, status)
SELECT
  id,
  'pro',
  stripe_customer_id,
  true,
  'past_due'
FROM users
WHERE is_paid = true
ON CONFLICT (user_id) DO NOTHING;

-- Initialize usage records for all users
INSERT INTO usage (user_id, searches_used, ai_messages_used)
SELECT
  id,
  COALESCE(free_searches_used, 0),
  COALESCE(analyst_queries_used, 0)
FROM users
ON CONFLICT (user_id) DO NOTHING;
