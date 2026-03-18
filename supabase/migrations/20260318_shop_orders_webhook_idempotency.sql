-- Ensure Stripe checkout session is unique per shop order for webhook idempotency.
CREATE UNIQUE INDEX IF NOT EXISTS idx_shop_orders_checkout_session_unique
  ON public.shop_orders (stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;
