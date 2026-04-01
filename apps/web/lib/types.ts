export type SkuRow = {
  id: string;
  sku_id: `0x${string}`;
  name: string;
  details: Record<string, unknown> | null;
  image_url: string | null;
  status?: "active" | "paused";
  card_year?: string | null;
  set_name?: string | null;
  player_name?: string | null;
  card_number?: string | null;
  parallel?: string | null;
  grade?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at?: string;
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

export type AdminListingRow = {
  id: string;
  skuId: `0x${string}`;
  name: string;
  imageUrl: string | null;
  status: "active" | "paused";
  year: string;
  set: string;
  player: string;
  cardNo: string;
  parallel: string;
  grade: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  availableQuantity: string;
  currentPegPrice: string;
  observedAt: string | null;
  nonce: string | null;
};

export type AdminListingDetail = {
  listing: AdminListingRow;
  recentComps: SoldCompRow[];
  recentPegUpdates: PegUpdateRow[];
};
