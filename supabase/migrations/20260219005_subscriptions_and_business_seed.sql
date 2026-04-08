-- Create subscriptions table if missing (allows Business tier)
-- Run this in Supabase SQL Editor if you don't have a subscriptions table yet.
-- Then replace YOUR_USER_ID with your auth user UUID and run the INSERT at the bottom.

-- Function for updated_at (skip if you already have it)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Subscriptions table (tier allows 'free', 'pro', 'business')
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tier TEXT NOT NULL DEFAULT 'free',
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  activation_paid BOOLEAN DEFAULT FALSE,
  current_period_end TIMESTAMPTZ,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  CONSTRAINT subscriptions_user_id_unique UNIQUE(user_id)
);

-- Allow 'business' in tier if table already existed with old check
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'subscriptions_tier_check'
    AND conrelid = 'public.subscriptions'::regclass
  ) THEN
    ALTER TABLE public.subscriptions DROP CONSTRAINT subscriptions_tier_check;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'subscriptions_tier_check'
    AND conrelid = 'public.subscriptions'::regclass
  ) THEN
    ALTER TABLE public.subscriptions
      ADD CONSTRAINT subscriptions_tier_check
      CHECK (tier IN ('free', 'pro', 'business'));
  END IF;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_subscription_id ON public.subscriptions(stripe_subscription_id);

-- Trigger
DROP TRIGGER IF EXISTS update_subscriptions_updated_at ON public.subscriptions;
CREATE TRIGGER update_subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own subscription" ON public.subscriptions;
DROP POLICY IF EXISTS "Users can read own subscription" ON public.subscriptions;
CREATE POLICY "Users can read own subscription"
  ON public.subscriptions FOR SELECT
  USING (auth.uid() = user_id);

-- ============================================
-- Add yourself as Business (run after table exists)
-- Replace YOUR_USER_ID with your auth.users id (from Authentication → Users in Supabase)
-- ============================================
-- INSERT INTO public.subscriptions (user_id, tier, status, activation_paid)
-- VALUES ('YOUR_USER_ID', 'business', 'active', true)
-- ON CONFLICT (user_id) DO UPDATE SET tier = 'business', status = 'active', activation_paid = true;
