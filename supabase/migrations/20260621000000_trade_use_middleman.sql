-- Trade Center settlement method.
-- true  = platform-mediated "middleman" swap, charged 3% of total trade value.
-- false = direct ship-to-ship trade — free, but reserved for subscribers.
ALTER TABLE public.trades
  ADD COLUMN IF NOT EXISTS use_middleman BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.trades.use_middleman IS
  'Settlement method: true = platform-mediated (3% of total trade value), false = direct ship-to-ship (free, subscriber-only).';
