-- Unify personal/business item storage under collection_items using item_kind.
-- Keeps legacy watchlist/business tables for backward compatibility.

-- Shared updated_at helper.
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add unified item_kind + business-facing columns to collection_items.
ALTER TABLE collection_items
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS item_kind TEXT,
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS quantity INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS acquisition_date DATE,
  ADD COLUMN IF NOT EXISTS cost_basis_total_cents INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_cents INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shipping_cents INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fees_paid_cents INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS condition_status TEXT NOT NULL DEFAULT 'raw',
  ADD COLUMN IF NOT EXISTS location TEXT,
  ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'unlisted',
  ADD COLUMN IF NOT EXISTS list_price_cents INT,
  ADD COLUMN IF NOT EXISTS current_market_value_cents INT,
  ADD COLUMN IF NOT EXISTS target_price NUMERIC;

UPDATE collection_items
SET item_kind = COALESCE(item_kind, 'owned');

UPDATE collection_items
SET title = COALESCE(
  NULLIF(title, ''),
  NULLIF(TRIM(CONCAT_WS(' ', year, player_name, set_name, grade)), ''),
  player_name
);

UPDATE collection_items
SET acquisition_type = 'unknown'
WHERE acquisition_type IS NOT NULL
  AND acquisition_type NOT IN (
    'pulled', 'bought', 'trade', 'gift', 'unknown',
    'buy', 'rip', 'consignment', 'other'
  );

UPDATE collection_items
SET condition_status = CASE
  WHEN LOWER(COALESCE(condition_status, '')) = 'graded' THEN 'graded'
  WHEN grade IS NOT NULL AND grade <> '' AND LOWER(grade) <> 'raw' THEN 'graded'
  ELSE 'raw'
END;

UPDATE collection_items
SET channel = CASE
  WHEN LOWER(COALESCE(channel, '')) IN ('ebay', 'whatnot', 'instagram', 'show', 'local', 'other')
    THEN LOWER(channel)
  ELSE 'other'
END;

UPDATE collection_items
SET status = CASE
  WHEN LOWER(COALESCE(status, '')) IN ('unlisted', 'listed', 'pending_sale', 'sold', 'returned')
    THEN LOWER(status)
  ELSE 'unlisted'
END;

-- Keep cost_basis/purchase_price in sync where one side is missing.
UPDATE collection_items
SET cost_basis_total_cents = COALESCE(cost_basis_total_cents, ROUND(COALESCE(purchase_price, 0) * 100)::INT);

UPDATE collection_items
SET purchase_price = CASE
  WHEN purchase_price IS NULL AND cost_basis_total_cents IS NOT NULL
    THEN (cost_basis_total_cents::NUMERIC / 100.0)
  ELSE purchase_price
END;

-- Replace acquisition_type check with a superset that supports personal + business terms.
ALTER TABLE collection_items
  DROP CONSTRAINT IF EXISTS collection_items_acquisition_type_check;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'collection_items_acquisition_type_check'
  ) THEN
    ALTER TABLE collection_items
      ADD CONSTRAINT collection_items_acquisition_type_check
      CHECK (
        acquisition_type IS NULL OR acquisition_type IN (
          'pulled', 'bought', 'trade', 'gift', 'unknown',
          'buy', 'rip', 'consignment', 'other'
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'collection_items_item_kind_check'
  ) THEN
    ALTER TABLE collection_items
      ADD CONSTRAINT collection_items_item_kind_check
      CHECK (item_kind IN ('owned', 'watch', 'inventory', 'prospect'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'collection_items_condition_status_check'
  ) THEN
    ALTER TABLE collection_items
      ADD CONSTRAINT collection_items_condition_status_check
      CHECK (condition_status IN ('raw', 'graded'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'collection_items_channel_check'
  ) THEN
    ALTER TABLE collection_items
      ADD CONSTRAINT collection_items_channel_check
      CHECK (channel IN ('ebay', 'whatnot', 'instagram', 'show', 'local', 'other'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'collection_items_status_check'
  ) THEN
    ALTER TABLE collection_items
      ADD CONSTRAINT collection_items_status_check
      CHECK (status IN ('unlisted', 'listed', 'pending_sale', 'sold', 'returned'));
  END IF;
END $$;

-- Keep updated_at current.
DROP TRIGGER IF EXISTS update_collection_items_updated_at ON collection_items;
CREATE TRIGGER update_collection_items_updated_at
  BEFORE UPDATE ON collection_items
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_collection_items_user_kind
  ON collection_items(user_id, item_kind);
CREATE INDEX IF NOT EXISTS idx_collection_items_user_kind_status
  ON collection_items(user_id, item_kind, status);

-- Promote active business users' existing "owned" cards to inventory mode.
UPDATE collection_items ci
SET
  item_kind = 'inventory',
  title = COALESCE(ci.title, NULLIF(TRIM(CONCAT_WS(' ', ci.year, ci.player_name, ci.set_name, ci.grade)), ''), ci.player_name),
  quantity = COALESCE(ci.quantity, 1),
  acquisition_date = COALESCE(
    ci.acquisition_date,
    CASE
      WHEN ci.purchase_date IS NOT NULL THEN ci.purchase_date::DATE
      ELSE NULL
    END
  ),
  condition_status = CASE
    WHEN ci.grade IS NOT NULL AND ci.grade <> '' AND LOWER(ci.grade) <> 'raw' THEN 'graded'
    ELSE COALESCE(ci.condition_status, 'raw')
  END,
  channel = COALESCE(NULLIF(ci.channel, ''), 'other'),
  status = COALESCE(NULLIF(ci.status, ''), 'unlisted')
FROM subscriptions s
WHERE s.user_id = ci.user_id
  AND s.tier = 'business'
  AND s.status = 'active'
  AND (s.current_period_end IS NULL OR s.current_period_end > NOW())
  AND COALESCE(ci.item_kind, 'owned') = 'owned';

-- One-time migration: legacy business_inventory_items -> collection_items (idempotent on id).
INSERT INTO collection_items (
  id,
  user_id,
  item_kind,
  title,
  player_name,
  year,
  set_name,
  grade,
  grading_company,
  cert_number,
  acquisition_type,
  purchase_price,
  purchase_date,
  quantity,
  acquisition_date,
  cost_basis_total_cents,
  tax_cents,
  shipping_cents,
  fees_paid_cents,
  condition_status,
  location,
  channel,
  status,
  list_price_cents,
  current_market_value_cents,
  estimated_cmv,
  est_cmv,
  notes,
  created_at,
  updated_at
)
SELECT
  bi.id,
  bi.user_id,
  'inventory',
  COALESCE(NULLIF(bi.title, ''), 'Business Item'),
  COALESCE(NULLIF(bi.title, ''), 'Business Item'),
  NULL,
  NULL,
  bi.grade,
  bi.grading_company,
  bi.cert_number,
  CASE
    WHEN bi.acquisition_type = 'buy' THEN 'buy'
    WHEN bi.acquisition_type = 'trade' THEN 'trade'
    WHEN bi.acquisition_type = 'rip' THEN 'rip'
    WHEN bi.acquisition_type = 'consignment' THEN 'consignment'
    ELSE 'other'
  END,
  CASE
    WHEN bi.cost_basis_total_cents IS NULL THEN NULL
    ELSE bi.cost_basis_total_cents::NUMERIC / 100.0
  END,
  bi.acquisition_date,
  COALESCE(bi.quantity, 1),
  bi.acquisition_date,
  COALESCE(bi.cost_basis_total_cents, 0),
  COALESCE(bi.tax_cents, 0),
  COALESCE(bi.shipping_cents, 0),
  COALESCE(bi.fees_paid_cents, 0),
  COALESCE(bi.condition_status, 'raw'),
  bi.location,
  COALESCE(bi.channel, 'other'),
  COALESCE(bi.status, 'unlisted'),
  bi.list_price_cents,
  bi.current_market_value_cents,
  CASE
    WHEN bi.current_market_value_cents IS NULL THEN NULL
    ELSE bi.current_market_value_cents::NUMERIC / 100.0
  END,
  CASE
    WHEN bi.current_market_value_cents IS NULL THEN NULL
    ELSE bi.current_market_value_cents::NUMERIC / 100.0
  END,
  bi.notes,
  bi.created_at,
  COALESCE(bi.updated_at, bi.created_at)
FROM business_inventory_items bi
ON CONFLICT (id) DO NOTHING;

-- One-time migration: active business users' legacy watchlist -> collection_items prospects.
INSERT INTO collection_items (
  user_id,
  item_kind,
  title,
  player_name,
  year,
  set_name,
  card_number,
  parallel_type,
  grade,
  acquisition_type,
  quantity,
  condition_status,
  channel,
  status,
  target_price,
  list_price_cents,
  current_market_value_cents,
  estimated_cmv,
  est_cmv,
  notes,
  created_at,
  updated_at
)
SELECT
  w.user_id,
  'prospect',
  NULLIF(TRIM(CONCAT_WS(' ', w.year, w.player_name, w.set_brand, w.condition)), ''),
  w.player_name,
  w.year,
  w.set_brand,
  CASE WHEN w.card_number ~ '^\d+$' THEN w.card_number::INTEGER ELSE NULL END,
  w.parallel_variant,
  w.condition,
  'other',
  1,
  CASE
    WHEN w.condition IS NOT NULL AND LOWER(w.condition) <> 'raw' THEN 'graded'
    ELSE 'raw'
  END,
  'other',
  'unlisted',
  w.target_price,
  CASE
    WHEN w.target_price IS NULL THEN NULL
    ELSE ROUND(w.target_price * 100)::INT
  END,
  CASE
    WHEN w.last_price IS NULL THEN NULL
    ELSE ROUND(w.last_price * 100)::INT
  END,
  w.last_price,
  w.last_price,
  'Migrated from legacy watchlist',
  w.created_at,
  w.updated_at
FROM watchlist w
JOIN subscriptions s
  ON s.user_id = w.user_id
 AND s.tier = 'business'
 AND s.status = 'active'
 AND (s.current_period_end IS NULL OR s.current_period_end > NOW())
WHERE NOT EXISTS (
  SELECT 1
  FROM collection_items ci
  WHERE ci.user_id = w.user_id
    AND COALESCE(ci.item_kind, 'owned') = 'prospect'
    AND LOWER(COALESCE(ci.player_name, '')) = LOWER(COALESCE(w.player_name, ''))
    AND COALESCE(ci.year, '') = COALESCE(w.year, '')
    AND COALESCE(ci.set_name, '') = COALESCE(w.set_brand, '')
    AND COALESCE(ci.card_number::TEXT, '') = COALESCE(w.card_number, '')
    AND COALESCE(ci.parallel_type, '') = COALESCE(w.parallel_variant, '')
);

-- Ensure all sales inventory ids exist before FK retarget.
INSERT INTO collection_items (
  id,
  user_id,
  item_kind,
  title,
  player_name,
  acquisition_type,
  quantity,
  condition_status,
  channel,
  status,
  created_at,
  updated_at
)
SELECT
  s.inventory_item_id,
  s.user_id,
  'inventory',
  'Migrated sale item',
  'Migrated sale item',
  'other',
  1,
  'raw',
  'other',
  'sold',
  NOW(),
  NOW()
FROM business_sales s
LEFT JOIN collection_items ci
  ON ci.id = s.inventory_item_id
WHERE ci.id IS NULL;

-- Repoint sales FK to unified collection_items ids.
ALTER TABLE business_sales
  DROP CONSTRAINT IF EXISTS business_sales_inventory_item_id_fkey;

ALTER TABLE business_sales
  ADD CONSTRAINT business_sales_inventory_item_id_fkey
  FOREIGN KEY (inventory_item_id)
  REFERENCES collection_items(id)
  ON DELETE CASCADE;
