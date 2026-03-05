export type SkuRow = {
  id: string;
  sku_id: `0x${string}`;
  name: string;
  details: Record<string, unknown> | null;
  image_url: string | null;
  created_at: string;
};

export type SoldCompRow = {
  id: string;
  sku_id: string;
  price_cents: string;
  sold_at: string;
  source: string | null;
  external_id: string | null;
  raw: Record<string, unknown> | null;
};

export type PegUpdateRow = {
  id: string;
  sku_id: string;
  peg_price: string;
  method: number;
  n: number;
  window_seconds: number;
  sales_hash: string;
  observed_at: string;
  nonce: string;
  tx_hash: string | null;
  created_at: string;
};
