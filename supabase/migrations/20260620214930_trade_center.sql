-- ============================================================================
-- Trade Center: peer-to-peer card trading (Veriswap-style, no platform custody).
--
-- Two users each put cards into a `trades` agreement, optionally with cash on
-- top to balance value. Both approve the current card+cash state, then they
-- ship directly to each other; CardzCheck records the agreement + statuses and
-- (optionally) per-side tracking. Cash legs settle through the same Stripe
-- Connect destination-charge pattern the marketplace already uses.
--
-- This migration is additive and idempotent (CREATE TABLE IF NOT EXISTS /
-- ADD COLUMN IF NOT EXISTS). Apply surgically via Supabase MCP, never a
-- blanket `db push`.
-- ============================================================================

-- 1) collection_items: a card the owner has flagged "Available for Trade".
ALTER TABLE public.collection_items
  ADD COLUMN IF NOT EXISTS is_tradeable BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_collection_items_tradeable
  ON public.collection_items (user_id)
  WHERE is_tradeable = true;

-- 2) trades — one row per trade agreement between two users.
CREATE TABLE IF NOT EXISTS public.trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  initiator_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'proposed',
  -- Cash on top: which side pays, how much, and where the payment stands.
  cash_from TEXT,                       -- 'initiator' | 'recipient' | NULL
  cash_cents INTEGER NOT NULL DEFAULT 0,
  cash_status TEXT NOT NULL DEFAULT 'none',  -- 'none' | 'pending' | 'paid'
  platform_fee_cents INTEGER NOT NULL DEFAULT 0,
  stripe_session_id TEXT,
  stripe_payment_intent_id TEXT,
  stripe_transfer_id TEXT,
  -- Both parties must approve the CURRENT state; any revision resets these.
  initiator_approved BOOLEAN NOT NULL DEFAULT false,
  recipient_approved BOOLEAN NOT NULL DEFAULT false,
  note TEXT,
  last_actor_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  CONSTRAINT trades_distinct_parties CHECK (initiator_id <> recipient_id),
  CONSTRAINT trades_status_check CHECK (status IN (
    'draft', 'proposed', 'countered', 'accepted', 'cash_pending',
    'confirmed', 'shipped', 'completed', 'declined', 'canceled'
  )),
  CONSTRAINT trades_cash_from_check CHECK (
    cash_from IS NULL OR cash_from IN ('initiator', 'recipient')
  ),
  CONSTRAINT trades_cash_status_check CHECK (
    cash_status IN ('none', 'pending', 'paid')
  ),
  CONSTRAINT trades_cash_amount_check CHECK (cash_cents >= 0)
);

CREATE INDEX IF NOT EXISTS idx_trades_initiator_recent
  ON public.trades (initiator_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_trades_recipient_recent
  ON public.trades (recipient_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_trades_status
  ON public.trades (status);

-- 3) trade_items — cards on each side of a trade. Values are snapshotted at
--    add-time so the agreement is stable even if inventory/CMV later changes.
CREATE TABLE IF NOT EXISTS public.trade_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id UUID NOT NULL REFERENCES public.trades(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  side TEXT NOT NULL CHECK (side IN ('initiator', 'recipient')),
  collection_item_id UUID REFERENCES public.collection_items(id) ON DELETE SET NULL,
  -- Snapshot columns.
  title TEXT,
  player TEXT,
  year TEXT,
  grade TEXT,
  grading_company TEXT,
  image_url TEXT,
  estimated_value_cents INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trade_items_trade
  ON public.trade_items (trade_id);
CREATE INDEX IF NOT EXISTS idx_trade_items_collection_item
  ON public.trade_items (collection_item_id);

-- 4) trade_shipments — per-side direct shipping/tracking (one row per shipper).
CREATE TABLE IF NOT EXISTS public.trade_shipments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id UUID NOT NULL REFERENCES public.trades(id) ON DELETE CASCADE,
  shipper_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  carrier TEXT,
  tracking_number TEXT,
  tracking_url TEXT,
  label_url TEXT,
  cost_cents INTEGER,
  shipped_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT trade_shipments_unique_shipper UNIQUE (trade_id, shipper_id)
);

CREATE INDEX IF NOT EXISTS idx_trade_shipments_trade
  ON public.trade_shipments (trade_id);

-- 5) marketplace_threads: allow a thread to hang off a trade (reuses the entire
--    messaging stack — triggers, unread counters, RLS, adapter). For a trade
--    thread, buyer_id = initiator, seller_id = recipient.
ALTER TABLE public.marketplace_threads
  ADD COLUMN IF NOT EXISTS trade_id UUID REFERENCES public.trades(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_marketplace_threads_trade
  ON public.marketplace_threads (trade_id) WHERE trade_id IS NOT NULL;

-- 6) updated_at triggers (reuse the shared helper used elsewhere).
DROP TRIGGER IF EXISTS update_trades_updated_at ON public.trades;
CREATE TRIGGER update_trades_updated_at
  BEFORE UPDATE ON public.trades
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_trade_shipments_updated_at ON public.trade_shipments;
CREATE TRIGGER update_trade_shipments_updated_at
  BEFORE UPDATE ON public.trade_shipments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 7) RLS — participants (initiator or recipient) can read/update; only the
--    initiator can create a trade. Server-side settlement uses the service role
--    (which bypasses RLS) to mark items traded and create incoming items.
ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trade_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trade_shipments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS trades_participant_select ON public.trades;
CREATE POLICY trades_participant_select
  ON public.trades FOR SELECT
  USING (auth.uid() = initiator_id OR auth.uid() = recipient_id);

DROP POLICY IF EXISTS trades_initiator_insert ON public.trades;
CREATE POLICY trades_initiator_insert
  ON public.trades FOR INSERT
  WITH CHECK (auth.uid() = initiator_id);

DROP POLICY IF EXISTS trades_participant_update ON public.trades;
CREATE POLICY trades_participant_update
  ON public.trades FOR UPDATE
  USING (auth.uid() = initiator_id OR auth.uid() = recipient_id)
  WITH CHECK (auth.uid() = initiator_id OR auth.uid() = recipient_id);

-- trade_items: access via parent trade participation.
DROP POLICY IF EXISTS trade_items_participant_select ON public.trade_items;
CREATE POLICY trade_items_participant_select
  ON public.trade_items FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.trades t
    WHERE t.id = trade_items.trade_id
      AND (auth.uid() = t.initiator_id OR auth.uid() = t.recipient_id)
  ));

DROP POLICY IF EXISTS trade_items_participant_insert ON public.trade_items;
CREATE POLICY trade_items_participant_insert
  ON public.trade_items FOR INSERT
  WITH CHECK (
    auth.uid() = owner_id
    AND EXISTS (
      SELECT 1 FROM public.trades t
      WHERE t.id = trade_items.trade_id
        AND (auth.uid() = t.initiator_id OR auth.uid() = t.recipient_id)
    )
  );

DROP POLICY IF EXISTS trade_items_participant_delete ON public.trade_items;
CREATE POLICY trade_items_participant_delete
  ON public.trade_items FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.trades t
    WHERE t.id = trade_items.trade_id
      AND (auth.uid() = t.initiator_id OR auth.uid() = t.recipient_id)
  ));

-- trade_shipments: a participant can read both sides; you may only write your
-- own shipment row.
DROP POLICY IF EXISTS trade_shipments_participant_select ON public.trade_shipments;
CREATE POLICY trade_shipments_participant_select
  ON public.trade_shipments FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.trades t
    WHERE t.id = trade_shipments.trade_id
      AND (auth.uid() = t.initiator_id OR auth.uid() = t.recipient_id)
  ));

DROP POLICY IF EXISTS trade_shipments_shipper_insert ON public.trade_shipments;
CREATE POLICY trade_shipments_shipper_insert
  ON public.trade_shipments FOR INSERT
  WITH CHECK (
    auth.uid() = shipper_id
    AND EXISTS (
      SELECT 1 FROM public.trades t
      WHERE t.id = trade_shipments.trade_id
        AND (auth.uid() = t.initiator_id OR auth.uid() = t.recipient_id)
    )
  );

DROP POLICY IF EXISTS trade_shipments_shipper_update ON public.trade_shipments;
CREATE POLICY trade_shipments_shipper_update
  ON public.trade_shipments FOR UPDATE
  USING (auth.uid() = shipper_id)
  WITH CHECK (auth.uid() = shipper_id);

COMMENT ON TABLE public.trades IS
  'Peer-to-peer card trade agreements (Trade Center). Direct P2P + tracked agreement; cash legs settle via Stripe Connect. See lib/trade/* and app/trade/*.';
