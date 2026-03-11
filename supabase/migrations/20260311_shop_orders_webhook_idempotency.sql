-- Ensure Stripe checkout session processing is idempotent.
-- A session should create/update exactly one order row.

CREATE UNIQUE INDEX IF NOT EXISTS idx_shop_orders_checkout_session_unique
  ON public.shop_orders (stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;
