-- Marketplace messages: when a participant sends a message, zero out their
-- own unread counter (sending implies they've read everything prior).
-- Prevents stale unread badges after a reply.

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
      WHEN NEW.sender_id = v_seller_id THEN 0
      ELSE unread_count_seller + 1
    END,
    unread_count_buyer = CASE
      WHEN NEW.sender_id = v_buyer_id THEN 0
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
