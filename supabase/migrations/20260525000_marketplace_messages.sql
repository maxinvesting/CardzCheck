-- ============================================================================
-- marketplace_messages: in-app buyer<->seller messaging for the CardzCheck
-- marketplace. Threads can optionally be tied to a listing and/or a
-- transaction. Powers the Sales Agent "CardzCheck" tab and the buyer-side
-- /marketplace/messages inbox.
-- ============================================================================

-- threads --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.marketplace_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  seller_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  listing_id UUID REFERENCES public.listings(id) ON DELETE SET NULL,
  transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
  subject TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_message_preview TEXT,
  last_sender_id UUID REFERENCES auth.users(id),
  unread_count_seller INTEGER NOT NULL DEFAULT 0,
  unread_count_buyer INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT marketplace_threads_status_check
    CHECK (status IN ('open', 'needs_response', 'awaiting_buyer', 'resolved', 'archived')),
  CONSTRAINT marketplace_threads_distinct_parties
    CHECK (buyer_id <> seller_id)
);

CREATE INDEX IF NOT EXISTS idx_marketplace_threads_seller_recent
  ON public.marketplace_threads (seller_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_marketplace_threads_buyer_recent
  ON public.marketplace_threads (buyer_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_marketplace_threads_listing
  ON public.marketplace_threads (listing_id) WHERE listing_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_marketplace_threads_transaction
  ON public.marketplace_threads (transaction_id) WHERE transaction_id IS NOT NULL;

-- messages -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.marketplace_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES public.marketplace_threads(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_marketplace_messages_thread
  ON public.marketplace_messages (thread_id, created_at);
CREATE INDEX IF NOT EXISTS idx_marketplace_messages_sender
  ON public.marketplace_messages (sender_id);

-- updated_at trigger ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_marketplace_threads_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_marketplace_threads_updated_at ON public.marketplace_threads;
CREATE TRIGGER trg_marketplace_threads_updated_at
  BEFORE UPDATE ON public.marketplace_threads
  FOR EACH ROW
  EXECUTE FUNCTION public.set_marketplace_threads_updated_at();

-- Trigger: when a message is inserted, bump thread last_message_at + preview
-- and increment unread counter for the OTHER party.
CREATE OR REPLACE FUNCTION public.on_marketplace_message_insert()
RETURNS TRIGGER AS $$
DECLARE
  v_buyer_id UUID;
  v_seller_id UUID;
BEGIN
  SELECT buyer_id, seller_id INTO v_buyer_id, v_seller_id
  FROM public.marketplace_threads
  WHERE id = NEW.thread_id;

  UPDATE public.marketplace_threads
  SET
    last_message_at = NEW.created_at,
    last_message_preview = LEFT(NEW.body, 240),
    last_sender_id = NEW.sender_id,
    unread_count_seller = CASE
      WHEN NEW.sender_id = v_seller_id THEN unread_count_seller
      ELSE unread_count_seller + 1
    END,
    unread_count_buyer = CASE
      WHEN NEW.sender_id = v_buyer_id THEN unread_count_buyer
      ELSE unread_count_buyer + 1
    END,
    status = CASE
      WHEN NEW.sender_id = v_buyer_id THEN 'needs_response'
      ELSE 'awaiting_buyer'
    END
  WHERE id = NEW.thread_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_marketplace_messages_after_insert ON public.marketplace_messages;
CREATE TRIGGER trg_marketplace_messages_after_insert
  AFTER INSERT ON public.marketplace_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.on_marketplace_message_insert();

-- RLS ------------------------------------------------------------------------
ALTER TABLE public.marketplace_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS marketplace_threads_participant_select ON public.marketplace_threads;
CREATE POLICY marketplace_threads_participant_select
  ON public.marketplace_threads
  FOR SELECT
  USING (auth.uid() = buyer_id OR auth.uid() = seller_id);

DROP POLICY IF EXISTS marketplace_threads_participant_insert ON public.marketplace_threads;
CREATE POLICY marketplace_threads_participant_insert
  ON public.marketplace_threads
  FOR INSERT
  WITH CHECK (auth.uid() = buyer_id OR auth.uid() = seller_id);

DROP POLICY IF EXISTS marketplace_threads_participant_update ON public.marketplace_threads;
CREATE POLICY marketplace_threads_participant_update
  ON public.marketplace_threads
  FOR UPDATE
  USING (auth.uid() = buyer_id OR auth.uid() = seller_id)
  WITH CHECK (auth.uid() = buyer_id OR auth.uid() = seller_id);

DROP POLICY IF EXISTS marketplace_messages_participant_select ON public.marketplace_messages;
CREATE POLICY marketplace_messages_participant_select
  ON public.marketplace_messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.marketplace_threads t
      WHERE t.id = thread_id
        AND (auth.uid() = t.buyer_id OR auth.uid() = t.seller_id)
    )
  );

DROP POLICY IF EXISTS marketplace_messages_participant_insert ON public.marketplace_messages;
CREATE POLICY marketplace_messages_participant_insert
  ON public.marketplace_messages
  FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id
    AND EXISTS (
      SELECT 1 FROM public.marketplace_threads t
      WHERE t.id = thread_id
        AND (auth.uid() = t.buyer_id OR auth.uid() = t.seller_id)
    )
  );

DROP POLICY IF EXISTS marketplace_messages_sender_update ON public.marketplace_messages;
CREATE POLICY marketplace_messages_sender_update
  ON public.marketplace_messages
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.marketplace_threads t
      WHERE t.id = thread_id
        AND (auth.uid() = t.buyer_id OR auth.uid() = t.seller_id)
    )
  );

-- Convenience comment for future devs
COMMENT ON TABLE public.marketplace_threads IS
  'Buyer<->seller conversations on the CardzCheck marketplace. Mapped into the unified MessageThread shape by lib/messaging/adapters/cardzcheck.ts; surfaced to sellers via the Sales Agent (CardzCheck tab) and to buyers via /marketplace/messages.';
