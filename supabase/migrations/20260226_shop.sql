-- Migration: Shop module – shop_listings + shop_orders
-- Date: 2026-02-26

-- ============================================
-- 1. SHOP_LISTINGS
-- ============================================
CREATE TABLE IF NOT EXISTS public.shop_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  slug text,
  description text,
  stripe_product_id text,
  stripe_price_id text,
  player_name text NOT NULL,
  year int NOT NULL,
  set_brand text NOT NULL,
  parallel_variant text,
  card_number text,
  grade text NOT NULL,
  cert_number text,
  sport text NOT NULL DEFAULT 'Football',
  price numeric(10,2) NOT NULL,
  cmv numeric(10,2),
  cost_basis numeric(10,2),
  quantity int NOT NULL DEFAULT 1,
  quantity_sold int NOT NULL DEFAULT 0,
  image_urls text[] DEFAULT '{}',
  thumbnail_url text,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','sold','reserved','delisted')),
  featured boolean NOT NULL DEFAULT false,
  is_premium boolean NOT NULL DEFAULT false,
  shipping_method text NOT NULL DEFAULT 'bmwt',
  shipping_cost numeric(10,2) NOT NULL DEFAULT 4.00,
  notes text,
  tags text[] DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_shop_listings_status_sport_player_created
  ON public.shop_listings (status, sport, player_name, created_at DESC);

DROP TRIGGER IF EXISTS trg_shop_listings_updated_at ON public.shop_listings;
CREATE TRIGGER trg_shop_listings_updated_at
  BEFORE UPDATE ON public.shop_listings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================
-- 2. SHOP_ORDERS
-- ============================================
CREATE TABLE IF NOT EXISTS public.shop_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  buyer_email text NOT NULL,
  buyer_name text NOT NULL,
  shipping_address jsonb NOT NULL,
  items jsonb NOT NULL,
  subtotal numeric(10,2),
  shipping_total numeric(10,2),
  total numeric(10,2),
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  payment_status text NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN ('pending','paid','failed','refunded')),
  fulfillment_status text NOT NULL DEFAULT 'unfulfilled'
    CHECK (fulfillment_status IN ('unfulfilled','shipped','delivered')),
  tracking_number text,
  tracking_carrier text,
  shipped_at timestamptz,
  notes text
);

CREATE INDEX IF NOT EXISTS idx_shop_orders_created
  ON public.shop_orders (created_at DESC);

-- ============================================
-- 3. RLS POLICIES
-- ============================================

-- shop_listings: public SELECT where status='active'; no public INSERT/UPDATE/DELETE
ALTER TABLE public.shop_listings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read active listings" ON public.shop_listings;
CREATE POLICY "Public can read active listings"
  ON public.shop_listings FOR SELECT
  USING (status = 'active');

-- shop_orders: NO public SELECT; NO public INSERT (webhook uses service role)
ALTER TABLE public.shop_orders ENABLE ROW LEVEL SECURITY;

-- No SELECT policy for anon/authenticated - admin uses service role
-- No INSERT policy - webhook uses service role

-- ============================================
-- 4. STORAGE BUCKET FOR SHOP IMAGES
-- ============================================
DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    INSERT INTO storage.buckets (id, name, public)
    SELECT 'shop-images', 'shop-images', true
    WHERE NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'shop-images');
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('storage.objects') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Shop images read public" ON storage.objects;
    CREATE POLICY "Shop images read public"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'shop-images');
  END IF;
END $$;
