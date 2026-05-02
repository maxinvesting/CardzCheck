import { createClient } from "@/lib/supabase/server";
import {
  hasRole,
  requireBusinessContext,
  type BusinessContext,
  type BusinessRole,
} from "@/lib/business/context";
import type { BusinessInventoryItem, BusinessSale, BusinessMetrics } from "@/types";
import { computeNetPayout, computeProfit } from "@/lib/business/sales-utils";
import { enqueueCertImageResolution } from "@/lib/images/cert-image-jobs";
import { normalizeCertWriteFields } from "@/lib/images/cert-image";
import { hydrateTrustedImagesForItems } from "@/lib/images/resolver";

// Uses unified collection_items table with item_kind = 'inventory'
const BUSINESS_TABLE = "collection_items" as const;
const BUSINESS_ITEM_KIND = "inventory" as const;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function assertUUIDs(ids: string[]): void {
  for (const id of ids) {
    if (!UUID_REGEX.test(id)) {
      throw new Error(`Invalid UUID in filter: ${id}`);
    }
  }
}

type BusinessInventoryRow = {
  id: string;
  user_id: string;
  business_account_id: string | null;
  item_kind: string | null;
  title: string;
  player_name?: string | null;
  year?: string | null;
  set_name?: string | null;
  insert_type?: string | null;
  parallel_type?: string | null;
  card_number?: string | null;
  quantity: number | null;
  acquisition_date: string | null;
  acquisition_type: string | null;
  cost_basis_total_cents: number | null;
  tax_cents: number | null;
  shipping_cents: number | null;
  fees_paid_cents: number | null;
  condition_status: string | null;
  grading_company: string | null;
  grade: string | null;
  cert_number: string | null;
  psa_cert_number: string | null;
  location: string | null;
  channel: string | null;
  status: string | null;
  list_price_cents: number | null;
  current_market_value_cents: number | null;
  estimated_cmv?: number | null;
  est_cmv?: number | null;
  last_known_price_cents?: number | null;
  last_price_cents?: number | null;
  last_price?: number | null;
  lowest_listing_cents?: number | null;
  lowest_listing_price_cents?: number | null;
  market_floor_cents?: number | null;
  market_floor_price_cents?: number | null;
  image_url: string | null;
  image_source: "psa" | "bgs" | "sgc" | "cgc" | "user" | "none" | null;
  user_image_url: string | null;
  cert_image_status?: "queued" | "running" | "resolved" | "no_image" | "failed" | null;
  cert_image_last_error?: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string | null;
};

/**
 * Require Business access, throwing a structured error if not.
 */
export async function requireBusinessAccess(
  userId: string
): Promise<BusinessContext> {
  return requireBusinessContext(userId);
}

function requireRole(
  context: BusinessContext,
  roles: ReadonlyArray<BusinessRole>,
  message: string
): void {
  if (!hasRole(context, roles)) {
    const err = new Error(message);
    (err as { status?: number }).status = 403;
    throw err;
  }
}

function normalizeAcquisitionType(
  value: string | null | undefined
): BusinessInventoryItem["acquisition_type"] {
  switch ((value || "").toLowerCase()) {
    case "buy":
    case "bought":
      return "buy";
    case "trade":
      return "trade";
    case "rip":
    case "pulled":
      return "rip";
    case "consignment":
      return "consignment";
    default:
      return "other";
  }
}

function normalizeChannel(
  value: string | null | undefined
): BusinessInventoryItem["channel"] {
  const normalized = (value || "").toLowerCase();
  if (
    normalized === "ebay" ||
    normalized === "whatnot" ||
    normalized === "instagram" ||
    normalized === "show" ||
    normalized === "local"
  ) {
    return normalized;
  }
  return "other";
}

function normalizeStatus(
  value: string | null | undefined
): BusinessInventoryItem["status"] {
  const normalized = (value || "").toLowerCase();
  if (
    normalized === "unlisted" ||
    normalized === "listed" ||
    normalized === "pending_sale" ||
    normalized === "sold" ||
    normalized === "returned"
  ) {
    return normalized;
  }
  return "unlisted";
}

function normalizeConditionStatus(
  value: string | null | undefined,
  grade: string | null | undefined
): BusinessInventoryItem["condition_status"] {
  const normalized = (value || "").toLowerCase();
  if (normalized === "raw" || normalized === "graded") return normalized;
  return grade ? "graded" : "raw";
}

function normalizeQuantity(value: number | null | undefined): number {
  if (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= 1
  ) {
    return value;
  }
  return 1;
}

function normalizeAcquisitionDate(
  value: string | null | undefined
): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  // Accept already-normalized ISO date.
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  // Accept common US date input (MM/DD/YYYY) from browser-localized controls.
  const usDate = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (usDate) {
    const month = Number.parseInt(usDate[1], 10);
    const day = Number.parseInt(usDate[2], 10);
    const year = Number.parseInt(usDate[3], 10);
    if (
      Number.isInteger(month) &&
      Number.isInteger(day) &&
      Number.isInteger(year) &&
      month >= 1 &&
      month <= 12 &&
      day >= 1 &&
      day <= 31
    ) {
      const isoMonth = String(month).padStart(2, "0");
      const isoDay = String(day).padStart(2, "0");
      return `${year}-${isoMonth}-${isoDay}`;
    }
  }

  return null;
}

function normalizeCardId(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toBusinessInventoryItem(row: BusinessInventoryRow): BusinessInventoryItem {
  return {
    id: row.id,
    user_id: row.user_id,
    business_account_id: row.business_account_id ?? row.user_id,
    card_id: row.id,
    title: row.title || "Untitled item",
    player_name: row.player_name ?? null,
    year: row.year ?? null,
    set_name: row.set_name ?? null,
    insert_type: row.insert_type ?? null,
    parallel_type: row.parallel_type ?? null,
    card_number: row.card_number ?? null,
    quantity: normalizeQuantity(row.quantity),
    acquisition_date: row.acquisition_date ?? null,
    acquisition_type: normalizeAcquisitionType(row.acquisition_type),
    cost_basis_total_cents: row.cost_basis_total_cents ?? 0,
    tax_cents: row.tax_cents ?? 0,
    shipping_cents: row.shipping_cents ?? 0,
    fees_paid_cents: row.fees_paid_cents ?? 0,
    condition_status: normalizeConditionStatus(row.condition_status, row.grade),
    grading_company: row.grading_company,
    grade: row.grade,
    cert_number: row.cert_number,
    psa_cert_number: row.psa_cert_number,
    cert_image_status: row.cert_image_status ?? null,
    cert_image_last_error: row.cert_image_last_error ?? null,
    location: row.location,
    channel: normalizeChannel(row.channel),
    status: normalizeStatus(row.status),
    list_price_cents: row.list_price_cents ?? null,
    current_market_value_cents: row.current_market_value_cents ?? null,
    estimated_cmv: row.estimated_cmv ?? null,
    est_cmv: row.est_cmv ?? null,
    last_known_price_cents: row.last_known_price_cents ?? null,
    last_price_cents: row.last_price_cents ?? null,
    last_price: row.last_price ?? null,
    lowest_listing_cents: row.lowest_listing_cents ?? null,
    lowest_listing_price_cents: row.lowest_listing_price_cents ?? null,
    market_floor_cents: row.market_floor_cents ?? null,
    market_floor_price_cents: row.market_floor_price_cents ?? null,
    image_url: row.image_url ?? null,
    image_source: row.image_source ?? "none",
    user_image_url: row.user_image_url ?? null,
    notes: row.notes,
    ebay_item_id: (row as any).ebay_item_id ?? null,
    ebay_listing_url: (row as any).ebay_listing_url ?? null,
    item_kind: (row.item_kind as "owned" | "inventory" | null) ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at || row.created_at,
  };
}

function buildInventoryInsertPayload(
  userId: string,
  businessAccountId: string,
  item: Omit<
    BusinessInventoryItem,
    "id" | "user_id" | "business_account_id" | "created_at" | "updated_at"
  >
): Record<string, unknown> {
  const title = item.title || "Untitled item";
  const rawItem = item as Record<string, unknown>;
  const normalizedCert = normalizeCertWriteFields({
    grading_company: item.grading_company,
    cert_number: item.cert_number,
    psa_cert_number: (item as any).psa_cert_number,
  });
  return {
    user_id: userId,
    business_account_id: businessAccountId,
    item_kind: BUSINESS_ITEM_KIND,
    title,
    player_name: rawItem.player_name || title,
    year: rawItem.year || null,
    set_name: rawItem.set_name || null,
    insert_type: rawItem.insert_type || null,
    parallel_type: rawItem.parallel_type || null,
    card_number: rawItem.card_number || null,
    quantity: normalizeQuantity(item.quantity),
    acquisition_type: item.acquisition_type ?? "other",
    acquisition_date: normalizeAcquisitionDate(item.acquisition_date),
    cost_basis_total_cents: item.cost_basis_total_cents ?? 0,
    tax_cents: item.tax_cents ?? 0,
    shipping_cents: item.shipping_cents ?? 0,
    fees_paid_cents: item.fees_paid_cents ?? 0,
    condition_status: item.condition_status ?? "raw",
    grading_company: normalizedCert.grading_company ?? item.grading_company ?? null,
    grade: item.grade || null,
    cert_number: normalizedCert.cert_number ?? null,
    psa_cert_number: normalizedCert.psa_cert_number ?? null,
    location: item.location || null,
    channel: item.channel ?? "other",
    status: item.status ?? "unlisted",
    list_price_cents: item.list_price_cents ?? null,
    current_market_value_cents: item.current_market_value_cents ?? null,
    image_url: (item as any).image_url || (item as any).user_image_url || null,
    image_source:
      (item as any).image_source || ((item as any).user_image_url ? "user" : "none"),
    user_image_url: (item as any).user_image_url || null,
    notes: item.notes || null,
  };
}

function buildInventoryUpdatePayload(
  updates: Partial<
    Omit<
      BusinessInventoryItem,
      "id" | "user_id" | "business_account_id" | "created_at" | "updated_at"
    >
  >
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  const normalizedCert = normalizeCertWriteFields({
    grading_company: updates.grading_company,
    cert_number: updates.cert_number,
    psa_cert_number: (updates as any).psa_cert_number,
  });
  if (updates.title !== undefined) payload.title = updates.title || "Untitled item";
  if (updates.quantity !== undefined)
    payload.quantity = normalizeQuantity(updates.quantity);
  if (updates.acquisition_type !== undefined)
    payload.acquisition_type = updates.acquisition_type;
  if (updates.acquisition_date !== undefined)
    payload.acquisition_date = normalizeAcquisitionDate(updates.acquisition_date);
  if (updates.cost_basis_total_cents !== undefined)
    payload.cost_basis_total_cents = updates.cost_basis_total_cents;
  if (updates.tax_cents !== undefined) payload.tax_cents = updates.tax_cents;
  if (updates.shipping_cents !== undefined)
    payload.shipping_cents = updates.shipping_cents;
  if (updates.fees_paid_cents !== undefined)
    payload.fees_paid_cents = updates.fees_paid_cents;
  if (updates.condition_status !== undefined)
    payload.condition_status = updates.condition_status;
  if (updates.grading_company !== undefined)
    payload.grading_company = normalizedCert.grading_company ?? updates.grading_company;
  if (updates.grade !== undefined) payload.grade = updates.grade;
  if (updates.cert_number !== undefined || updates.grading_company !== undefined)
    payload.cert_number = normalizedCert.cert_number ?? null;
  if ((updates as any).psa_cert_number !== undefined || updates.grading_company !== undefined)
    payload.psa_cert_number = normalizedCert.psa_cert_number ?? null;
  if (updates.location !== undefined) payload.location = updates.location;
  if (updates.channel !== undefined) payload.channel = updates.channel;
  if (updates.status !== undefined) payload.status = updates.status;
  if (updates.list_price_cents !== undefined)
    payload.list_price_cents = updates.list_price_cents;
  if (updates.current_market_value_cents !== undefined)
    payload.current_market_value_cents = updates.current_market_value_cents;
  if ((updates as any).image_url !== undefined) payload.image_url = (updates as any).image_url;
  if ((updates as any).image_source !== undefined)
    payload.image_source = (updates as any).image_source;
  if (updates.notes !== undefined) payload.notes = updates.notes;
  if (updates.user_image_url !== undefined)
    payload.user_image_url = updates.user_image_url;
  return payload;
}

// =============================================
// INVENTORY CRUD
// =============================================

export async function listInventory(
  userId: string,
  filters?: {
    status?: string;
    channel?: string;
    condition_status?: string;
    search?: string;
  }
): Promise<BusinessInventoryItem[]> {
  const context = await requireBusinessAccess(userId);
  const supabase = await createClient();

  let query = supabase
    .from(BUSINESS_TABLE)
    .select("*")
    .eq("user_id", userId)
    .eq("item_kind", BUSINESS_ITEM_KIND)
    .order("created_at", { ascending: false });

  if (filters?.status) {
    query = query.eq("status", filters.status);
  } else {
    // By default, exclude sold and returned items from inventory listings
    query = query.neq("status", "sold").neq("status", "returned");
  }
  if (filters?.channel) query = query.eq("channel", filters.channel);
  if (filters?.condition_status)
    query = query.eq("condition_status", filters.condition_status);
  if (filters?.search) {
    const search = filters.search.replace(/,/g, " ").trim();
    if (search.length > 0) {
      query = query.or(
        `title.ilike.%${search}%,notes.ilike.%${search}%`
      );
    }
  }

  const { data, error } = await query;
  if (error) throw error;

  const items = ((data ?? []) as BusinessInventoryRow[]).map(toBusinessInventoryItem);
  return hydrateTrustedImagesForItems({
    supabase,
    items,
    userId,
  });
}

export async function getInventoryItem(
  userId: string,
  itemId: string
): Promise<BusinessInventoryItem | null> {
  const context = await requireBusinessAccess(userId);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from(BUSINESS_TABLE)
    .select("*")
    .eq("id", itemId)
    .eq("user_id", userId)
    .eq("item_kind", BUSINESS_ITEM_KIND)
    .maybeSingle();

  if (error && error.code !== "PGRST116") throw error;
  if (!data) return null;
  const item = toBusinessInventoryItem(data as BusinessInventoryRow);
  const [hydrated] = await hydrateTrustedImagesForItems({
    supabase,
    items: [item],
    userId,
  });
  return hydrated ?? item;
}

export async function createInventoryItem(
  userId: string,
  item: Omit<
    BusinessInventoryItem,
    "id" | "user_id" | "business_account_id" | "created_at" | "updated_at"
  >
): Promise<BusinessInventoryItem> {
  const context = await requireBusinessAccess(userId);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from(BUSINESS_TABLE)
    .insert(buildInventoryInsertPayload(userId, context.businessAccountId, item))
    .select("*")
    .single();

  if (error) throw error;
  const itemRecord = toBusinessInventoryItem(data as BusinessInventoryRow);
  await enqueueCertImageResolution({ itemId: itemRecord.id });
  const [hydrated] = await hydrateTrustedImagesForItems({
    supabase,
    items: [itemRecord],
    userId,
  });
  return hydrated ?? itemRecord;
}

export async function updateInventoryItem(
  userId: string,
  itemId: string,
  updates: Partial<
    Omit<
      BusinessInventoryItem,
      "id" | "user_id" | "business_account_id" | "created_at" | "updated_at"
    >
  >
): Promise<BusinessInventoryItem> {
  const context = await requireBusinessAccess(userId);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from(BUSINESS_TABLE)
    .update(buildInventoryUpdatePayload(updates))
    .eq("id", itemId)
    .eq("user_id", userId)
    .eq("item_kind", BUSINESS_ITEM_KIND)
    .select("*")
    .single();

  if (error) throw error;
  const itemRecord = toBusinessInventoryItem(data as BusinessInventoryRow);
  await enqueueCertImageResolution({ itemId: itemRecord.id });
  const [hydrated] = await hydrateTrustedImagesForItems({
    supabase,
    items: [itemRecord],
    userId,
  });
  return hydrated ?? itemRecord;
}

export async function deleteInventoryItems(
  userId: string,
  itemIds: string[]
): Promise<void> {
  const context = await requireBusinessAccess(userId);
  requireRole(
    context,
    ["owner", "manager"],
    "Only owners and managers can remove inventory items"
  );
  const supabase = await createClient();

  const { error } = await supabase
    .from(BUSINESS_TABLE)
    .delete()
    .in("id", itemIds)
    .eq("user_id", userId)
    .eq("item_kind", BUSINESS_ITEM_KIND);

  if (error) throw error;
}

/**
 * Toggle an item between personal collection ('owned') and business inventory ('inventory').
 * When moving to inventory, cost_basis_total_cents can be provided if not already set.
 * Requires Business access since toggling affects inventory tracking.
 */
export async function updateItemKind(
  userId: string,
  itemId: string,
  targetKind: "owned" | "inventory",
  options?: { cost_basis_total_cents?: number }
): Promise<void> {
  const context = await requireBusinessAccess(userId);
  const supabase = await createClient();

  const payload: Record<string, unknown> = {
    item_kind: targetKind,
    business_account_id:
      targetKind === "inventory" ? context.businessAccountId : null,
  };
  if (targetKind === "inventory" && options?.cost_basis_total_cents !== undefined) {
    payload.cost_basis_total_cents = options.cost_basis_total_cents;
  }

  const { error } = await supabase
    .from("collection_items")
    .update(payload)
    .eq("id", itemId)
    .eq("user_id", userId);

  if (error) throw error;
}

export async function bulkUpdateInventory(
  userId: string,
  itemIds: string[],
  updates: { status?: string; location?: string }
): Promise<void> {
  const context = await requireBusinessAccess(userId);
  const supabase = await createClient();

  const payload: Record<string, unknown> = {};
  if (updates.status !== undefined) payload.status = updates.status;
  if (updates.location !== undefined) payload.location = updates.location;

  const { error } = await supabase
    .from(BUSINESS_TABLE)
    .update(payload)
    .in("id", itemIds)
    .eq("user_id", userId)
    .eq("item_kind", BUSINESS_ITEM_KIND);

  if (error) throw error;
}

// =============================================
// SALES CRUD
// =============================================

type BusinessSaleRow = {
  id: string;
  user_id: string;
  business_id?: string | null;
  business_account_id?: string | null;
  inventory_item_id?: string | null;
  channel?: string | null;
  sold_at?: string | null;
  sold_price_cents?: number | null;
  shipping_charged_cents?: number | null;
  platform_fees_cents?: number | null;
  shipping_cost_cents?: number | null;
  tax_cents?: number | null;
  net_payout_cents?: number | null;
  cogs_cents?: number | null;
  profit_cents?: number | null;
  notes?: string | null;
  external_order_id?: string | null;
  is_deleted?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
  // Legacy business_sales columns
  sale_date?: string | null;
  sale_price_cents?: number | null;
  shipping_paid_cents?: number | null;
  other_costs_cents?: number | null;
  net_proceeds_cents?: number | null;
  order_id?: string | null;
};

type SaleWriteInput = {
  inventory_item_id?: string | null;
  channel?: string | null;
  sold_at?: string | null;
  sold_price_cents?: number | null;
  shipping_charged_cents?: number | null;
  platform_fees_cents?: number | null;
  shipping_cost_cents?: number | null;
  tax_cents?: number | null;
  net_payout_cents?: number | null;
  cogs_cents?: number | null;
  notes?: string | null;
  external_order_id?: string | null;
};

function getDbErrorMeta(error: unknown): {
  code: string;
  message: string;
  details: string;
  combined: string;
} {
  const code = String((error as { code?: string })?.code ?? "");
  const message = String((error as { message?: string })?.message ?? "");
  const details = String((error as { details?: string })?.details ?? "");
  return {
    code,
    message,
    details,
    combined: `${message} ${details}`.toLowerCase(),
  };
}

/**
 * Detect "mixed schema" environments where sales code is querying upgraded columns
 * but the DB still has legacy sales fields (or vice versa).
 */
function isBusinessSalesSchemaMismatch(error: unknown): boolean {
  const { code, combined } = getDbErrorMeta(error);
  const mentionsSales =
    combined.includes("business_sales") ||
    /(business_id|business_account_id|is_deleted|sold_at|sold_price_cents|shipping_cost_cents|tax_cents|net_payout_cents|cogs_cents|external_order_id|sale_date|sale_price_cents|shipping_paid_cents|other_costs_cents|net_proceeds_cents|order_id)/.test(
      combined
    );
  if (!mentionsSales) return false;

  if (code === "42703" || code === "42P01" || code === "PGRST204" || code === "PGRST205") {
    return true;
  }

  return (
    combined.includes("column") &&
    /(business_id|business_account_id|is_deleted|sold_at|sold_price_cents|shipping_cost_cents|tax_cents|net_payout_cents|cogs_cents|external_order_id|sale_date|sale_price_cents|shipping_paid_cents|other_costs_cents|net_proceeds_cents|order_id)/.test(
      combined
    )
  );
}

/**
 * Map known Supabase/Postgres errors from sale creation into structured errors
 * with .status 400/403 so the API can return user-friendly messages.
 */
function normalizeBusinessSaleError(error: unknown): never {
  const code = typeof (error as { code?: string })?.code === "string" ? (error as { code: string }).code : "";
  const message = String((error as { message?: string })?.message ?? "");
  const details = (error as { details?: string })?.details ?? "";

  // Unique constraint violation (e.g. duplicate external_order_id per business)
  if (code === "23505") {
    const isExternalOrder =
      /idx_business_sales_business_external_order|external_order_id|unique.*external_order/i.test(message) ||
      /idx_business_sales_business_external_order|external_order_id/i.test(details);
    if (isExternalOrder) {
      const err = new Error("External order ID is already used for another sale in this business");
      (err as any).status = 400;
      throw err;
    }
    const err = new Error("A sale with these details already exists");
    (err as any).status = 400;
    throw err;
  }

  // RLS / permission denied
  if (code === "42501" || /permission denied|row-level security/i.test(message)) {
    const err = new Error("You don't have permission to record sales for this business");
    (err as any).status = 403;
    throw err;
  }

  // Not-null or check constraint (e.g. channel, required columns)
  if (code === "23502" || code === "23514") {
    const err = new Error(
      message && message.length < 200 ? message : "Invalid sale data: check required fields and channel."
    );
    (err as any).status = 400;
    throw err;
  }

  // Foreign-key mismatch (commonly inventory_item_id when FK points to collection_items).
  if (code === "23503") {
    const isInventoryLink =
      /business_sales_inventory_item_id_fkey|inventory_item_id|foreign key/i.test(message) ||
      /business_sales_inventory_item_id_fkey|inventory_item_id|foreign key/i.test(details);
    const err = new Error(
      isInventoryLink
        ? "Inventory item link is invalid for sales. Please reopen the item and try again."
        : "Referenced record was not found for this sale."
    );
    (err as any).status = 400;
    throw err;
  }

  if (isBusinessSalesSchemaMismatch(error)) {
    const err = new Error(
      "Sales table schema mismatch detected. Please run the latest business sales migration."
    );
    (err as any).status = 400;
    throw err;
  }

  throw error;
}

function toInt(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.round(value);
}

function normalizeSaleDateTime(value: string | null | undefined): string {
  if (!value) return new Date().toISOString();
  const trimmed = value.trim();
  if (!trimmed) return new Date().toISOString();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return `${trimmed}T00:00:00.000Z`;
  }
  const dt = new Date(trimmed);
  if (Number.isNaN(dt.getTime())) return new Date().toISOString();
  return dt.toISOString();
}

function isUUID(value: string): boolean {
  return UUID_REGEX.test(value);
}

function toBusinessSale(row: BusinessSaleRow): BusinessSale {
  const soldPriceCents = toInt(row.sold_price_cents ?? row.sale_price_cents);
  const shippingChargedCents = toInt(row.shipping_charged_cents);
  const platformFeesCents = toInt(row.platform_fees_cents);
  const shippingCostCents = toInt(row.shipping_cost_cents ?? row.shipping_paid_cents);
  const taxCents = toInt(row.tax_cents ?? row.other_costs_cents);

  const netPayoutCents = toInt(
    row.net_payout_cents ??
      row.net_proceeds_cents ??
      computeNetPayout({
        sold_price_cents: soldPriceCents,
        shipping_charged_cents: shippingChargedCents,
        platform_fees_cents: platformFeesCents,
        shipping_cost_cents: shippingCostCents,
        tax_cents: taxCents,
      })
  );

  const cogsFromProfit =
    row.cogs_cents == null && row.profit_cents != null
      ? netPayoutCents - toInt(row.profit_cents)
      : row.cogs_cents;
  const cogsCents = toInt(cogsFromProfit);
  const grossRevenueCents = soldPriceCents + shippingChargedCents;
  const soldAt = normalizeSaleDateTime(row.sold_at ?? row.sale_date);

  const createdAt =
    typeof row.created_at === "string" && row.created_at.trim()
      ? row.created_at
      : soldAt;
  const updatedAt =
    typeof row.updated_at === "string" && row.updated_at.trim()
      ? row.updated_at
      : createdAt;

  return {
    id: row.id,
    user_id: row.user_id,
    business_id: row.business_id || row.user_id,
    business_account_id:
      row.business_account_id || row.business_id || row.user_id,
    inventory_item_id: row.inventory_item_id ?? null,
    channel: normalizeChannel(row.channel),
    sold_at: soldAt,
    sold_price_cents: soldPriceCents,
    shipping_charged_cents: shippingChargedCents,
    platform_fees_cents: platformFeesCents,
    shipping_cost_cents: shippingCostCents,
    tax_cents: taxCents,
    net_payout_cents: netPayoutCents,
    cogs_cents: cogsCents,
    gross_revenue_cents: grossRevenueCents,
    profit_cents:
      row.profit_cents != null
        ? toInt(row.profit_cents)
        : computeProfit({ net_payout_cents: netPayoutCents, cogs_cents: cogsCents }),
    external_order_id: row.external_order_id ?? row.order_id ?? null,
    notes: row.notes ?? null,
    is_deleted: Boolean(row.is_deleted),
    inventory_item: null,
    created_at: createdAt,
    updated_at: updatedAt,
  };
}

async function attachInventoryTitles(
  _businessAccountId: string,
  sales: BusinessSale[]
): Promise<BusinessSale[]> {
  const inventoryIds = Array.from(
    new Set(
      sales
        .map((sale) => sale.inventory_item_id)
        .filter((value): value is string => Boolean(value))
    )
  );

  if (inventoryIds.length === 0) return sales;
  const validInventoryIds = inventoryIds.filter(isUUID);
  if (validInventoryIds.length === 0) return sales;

  const supabase = await createClient();
  // Do not filter by business_account_id here: legacy collection_items rows may have
  // a null or stale business_account_id while still belonging to this user. RLS on
  // collection_items scopes rows to the authenticated user.
  const { data, error } = await supabase
    .from(BUSINESS_TABLE)
    .select("id, title")
    .in("id", validInventoryIds);
  if (error) return sales;

  const titleById = new Map<string, string>();
  for (const row of data ?? []) {
    if (row?.id) {
      titleById.set(row.id, row.title || "Untitled item");
    }
  }

  return sales.map((sale) => ({
    ...sale,
    inventory_item: sale.inventory_item_id
      ? {
          id: sale.inventory_item_id,
          title: titleById.get(sale.inventory_item_id) || "Untitled item",
        }
      : null,
  }));
}

async function getInventoryContextForSale(
  args: {
    businessAccountId: string;
    userId: string;
    ownerUserId: string;
    inventoryItemId?: string | null;
  }
): Promise<{ id: string; title: string | null; channel: string | null; cost_basis_total_cents: number | null } | null> {
  const { businessAccountId, userId, ownerUserId, inventoryItemId } = args;
  if (!inventoryItemId) return null;
  const supabase = await createClient();
  const scopedLookup = await supabase
    .from(BUSINESS_TABLE)
    .select("id, title, channel, cost_basis_total_cents")
    .eq("id", inventoryItemId)
    .eq("business_account_id", businessAccountId)
    .maybeSingle();

  if (
    scopedLookup.error &&
    !isBusinessSalesSchemaMismatch(scopedLookup.error)
  ) {
    throw scopedLookup.error;
  }

  let data = scopedLookup.data;

  // Older inventory rows may not have business_account_id populated yet.
  if (!data) {
    const fallbackUserIds = Array.from(
      new Set(
        [userId, ownerUserId].filter(
          (value): value is string => typeof value === "string" && value.length > 0
        )
      )
    );

    let fallbackQuery = supabase
      .from(BUSINESS_TABLE)
      .select("id, title, channel, cost_basis_total_cents")
      .eq("id", inventoryItemId)
      .eq("item_kind", BUSINESS_ITEM_KIND);

    if (fallbackUserIds.length === 1) {
      fallbackQuery = fallbackQuery.eq("user_id", fallbackUserIds[0]);
    } else if (fallbackUserIds.length > 1) {
      fallbackQuery = fallbackQuery.in("user_id", fallbackUserIds);
    }

    const fallbackLookup = await fallbackQuery.maybeSingle();
    if (fallbackLookup.error) throw fallbackLookup.error;
    data = fallbackLookup.data;
  }

  if (!data) return null;

  return {
    id: data.id,
    title: data.title ?? null,
    channel: data.channel ?? null,
    cost_basis_total_cents: data.cost_basis_total_cents ?? 0,
  };
}

/**
 * No-op: inventory items are now stored directly in collection_items,
 * so no mirror row needs to be created before recording a sale.
 * The inventory item IS already a collection_items row.
 */
async function ensureCollectionItemMirrorForSale(
  _supabase: Awaited<ReturnType<typeof createClient>>,
  _userId: string,
  _inventoryContext: { id: string; title: string | null } | null
): Promise<void> {
  // Nothing to do — business inventory lives in collection_items directly.
}

async function markInventoryItemSold(args: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  inventoryItemId: string;
  businessAccountId: string;
  userId: string;
  ownerUserId: string;
}): Promise<void> {
  const { supabase, inventoryItemId, businessAccountId, userId, ownerUserId } = args;

  const scopedUpdate = await supabase
    .from(BUSINESS_TABLE)
    .update({ status: "sold" })
    .eq("id", inventoryItemId)
    .eq("item_kind", BUSINESS_ITEM_KIND)
    .eq("business_account_id", businessAccountId)
    .select("id")
    .maybeSingle();

  if (
    scopedUpdate.error &&
    !isBusinessSalesSchemaMismatch(scopedUpdate.error)
  ) {
    normalizeBusinessSaleError(scopedUpdate.error);
  }

  if (scopedUpdate.data) return;

  const fallbackUserIds = Array.from(
    new Set(
      [userId, ownerUserId].filter(
        (value): value is string => typeof value === "string" && value.length > 0
      )
    )
  );

  let fallbackUpdate = supabase
    .from(BUSINESS_TABLE)
    .update({ status: "sold" })
    .eq("id", inventoryItemId)
    .eq("item_kind", BUSINESS_ITEM_KIND);

  if (fallbackUserIds.length === 1) {
    fallbackUpdate = fallbackUpdate.eq("user_id", fallbackUserIds[0]);
  } else if (fallbackUserIds.length > 1) {
    fallbackUpdate = fallbackUpdate.in("user_id", fallbackUserIds);
  }

  const fallbackResult = await fallbackUpdate.select("id").maybeSingle();
  if (fallbackResult.error) {
    normalizeBusinessSaleError(fallbackResult.error);
  }
}

function buildComputedSalePayload(args: {
  userId: string;
  businessAccountId: string;
  legacyBusinessOwnerId: string;
  base: SaleWriteInput;
  inventoryContext: { id: string; channel: string | null; cost_basis_total_cents: number | null } | null;
}) {
  const { userId, businessAccountId, legacyBusinessOwnerId, base, inventoryContext } = args;

  const soldPriceCents = toInt(base.sold_price_cents);
  const shippingChargedCents = toInt(base.shipping_charged_cents);
  const platformFeesCents = toInt(base.platform_fees_cents);
  const shippingCostCents = toInt(base.shipping_cost_cents);
  const taxCents = toInt(base.tax_cents);
  const cogsCents = toInt(
    base.cogs_cents != null ? base.cogs_cents : inventoryContext?.cost_basis_total_cents
  );

  const netPayoutCents = computeNetPayout({
    sold_price_cents: soldPriceCents,
    shipping_charged_cents: shippingChargedCents,
    platform_fees_cents: platformFeesCents,
    shipping_cost_cents: shippingCostCents,
    tax_cents: taxCents,
    net_payout_cents: base.net_payout_cents,
  });
  const profitCents = computeProfit({
    net_payout_cents: netPayoutCents,
    cogs_cents: cogsCents,
  });
  const soldAt = normalizeSaleDateTime(base.sold_at);
  const normalizedChannel = normalizeChannel(base.channel ?? inventoryContext?.channel);

  return {
    user_id: userId,
    business_id: legacyBusinessOwnerId,
    business_account_id: businessAccountId,
    inventory_item_id: inventoryContext?.id ?? base.inventory_item_id ?? null,
    channel: normalizedChannel,
    sold_at: soldAt,
    sold_price_cents: soldPriceCents,
    shipping_charged_cents: shippingChargedCents,
    platform_fees_cents: platformFeesCents,
    shipping_cost_cents: shippingCostCents,
    tax_cents: taxCents,
    net_payout_cents: netPayoutCents,
    cogs_cents: cogsCents,
    profit_cents: profitCents,
    notes: base.notes?.trim() || null,
    external_order_id: base.external_order_id?.trim() || null,
    is_deleted: false,
  };
}

function buildLegacySalePayload(
  payload: ReturnType<typeof buildComputedSalePayload>
): Record<string, unknown> {
  const inventoryItemId =
    typeof payload.inventory_item_id === "string" && payload.inventory_item_id.trim()
      ? payload.inventory_item_id
      : null;
  if (!inventoryItemId) {
    const err = new Error(
      "Inventory item is required to record sales in this business schema"
    );
    (err as any).status = 400;
    throw err;
  }

  const soldAt = normalizeSaleDateTime(
    typeof payload.sold_at === "string" ? payload.sold_at : null
  );
  return {
    user_id: payload.user_id,
    inventory_item_id: inventoryItemId,
    sale_date: soldAt.slice(0, 10),
    sale_price_cents: toInt(payload.sold_price_cents as number),
    platform_fees_cents: toInt(payload.platform_fees_cents as number),
    shipping_charged_cents: toInt(payload.shipping_charged_cents as number),
    shipping_paid_cents: toInt(payload.shipping_cost_cents as number),
    other_costs_cents: toInt(payload.tax_cents as number),
    net_proceeds_cents: toInt(payload.net_payout_cents as number),
    profit_cents: toInt(payload.profit_cents as number),
    order_id:
      typeof payload.external_order_id === "string" &&
      payload.external_order_id.trim()
        ? payload.external_order_id.trim()
        : null,
    notes:
      typeof payload.notes === "string" && payload.notes.trim()
        ? payload.notes.trim()
        : null,
  };
}

async function listLegacySales(args: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  ownerUserId: string;
  page: number;
  pageSize: number;
  from?: string;
  to?: string;
  inventoryItemId?: string;
  search?: string;
}): Promise<{ data: BusinessSaleRow[]; count: number }> {
  const { supabase, ownerUserId, page, pageSize, from, to, inventoryItemId, search } =
    args;
  let query = supabase
    .from("business_sales")
    .select("*", { count: "exact" })
    .eq("user_id", ownerUserId)
    .order("sale_date", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (inventoryItemId) query = query.eq("inventory_item_id", inventoryItemId);
  if (from) query = query.gte("sale_date", normalizeSaleDateTime(from).slice(0, 10));
  if (to) query = query.lte("sale_date", normalizeSaleDateTime(to).slice(0, 10));

  if (search) {
    const q = search.replace(/,/g, " ").trim();
    if (q.length > 0) {
      const { data: inventoryMatches } = await supabase
        .from(BUSINESS_TABLE)
        .select("id")
        .eq("user_id", ownerUserId)
        .ilike("title", `%${q}%`);

      const inventoryIds = (inventoryMatches ?? [])
        .map((row: { id: string | null }) => row.id)
        .filter((value: string | null): value is string => Boolean(value));
      const escapedQ = q.replace(/%/g, "\\%").replace(/,/g, " ");

      if (inventoryIds.length > 0) {
        assertUUIDs(inventoryIds);
        query = query.or(
          `notes.ilike.%${escapedQ}%,order_id.ilike.%${escapedQ}%,inventory_item_id.in.(${inventoryIds.join(",")})`
        );
      } else {
        query = query.or(`notes.ilike.%${escapedQ}%,order_id.ilike.%${escapedQ}%`);
      }
    }
  }

  const { data, error, count } = await query;
  if (error) throw error;
  return {
    data: (data ?? []) as BusinessSaleRow[],
    count: count ?? 0,
  };
}

export async function listSales(
  userId: string,
  filters?: {
    inventoryItemId?: string;
    startDate?: string;
    endDate?: string;
    from?: string;
    to?: string;
    page?: number;
    pageSize?: number;
    channel?: string;
    search?: string;
  }
): Promise<{
  sales: BusinessSale[];
  page: number;
  pageSize: number;
  total: number;
}> {
  const context = await requireBusinessAccess(userId);
  const supabase = await createClient();

  const page = Math.max(filters?.page ?? 1, 1);
  const pageSize = Math.min(Math.max(filters?.pageSize ?? 50, 1), 200);
  const from = filters?.from ?? filters?.startDate;
  const to = filters?.to ?? filters?.endDate;

  let query = supabase
    .from("business_sales")
    .select("*", { count: "exact" })
    .eq("business_account_id", context.businessAccountId)
    .eq("is_deleted", false)
    .order("sold_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (filters?.inventoryItemId) {
    const { data: ownerCheck } = await supabase
      .from(BUSINESS_TABLE)
      .select("id")
      .eq("id", filters.inventoryItemId)
      .eq("business_account_id", context.businessAccountId)
      .maybeSingle();
    if (!ownerCheck) {
      throw new Error("Unauthorized: inventoryItemId does not belong to user");
    }
    query = query.eq("inventory_item_id", filters.inventoryItemId);
  }
  if (from) query = query.gte("sold_at", normalizeSaleDateTime(from));
  if (to) {
    const toDate = /^\d{4}-\d{2}-\d{2}$/.test(to)
      ? `${to}T23:59:59.999Z`
      : normalizeSaleDateTime(to);
    query = query.lte("sold_at", toDate);
  }
  if (filters?.channel) query = query.eq("channel", normalizeChannel(filters.channel));
  if (filters?.search) {
    const q = filters.search.replace(/,/g, " ").trim();
    if (q.length > 0) {
      const { data: inventoryMatches } = await supabase
        .from(BUSINESS_TABLE)
        .select("id")
        .eq("business_account_id", context.businessAccountId)
        .ilike("title", `%${q}%`);

      const inventoryIds = (inventoryMatches ?? [])
        .map((row: { id: string | null }) => row.id)
        .filter((value: string | null): value is string => Boolean(value));
      const escapedQ = q.replace(/%/g, "\\%").replace(/,/g, " ");

      if (inventoryIds.length > 0) {
        assertUUIDs(inventoryIds);
        query = query.or(
          `notes.ilike.%${escapedQ}%,external_order_id.ilike.%${escapedQ}%,inventory_item_id.in.(${inventoryIds.join(",")})`
        );
      } else {
        query = query.or(
          `notes.ilike.%${escapedQ}%,external_order_id.ilike.%${escapedQ}%`
        );
      }
    }
  }

  const { data, error, count } = await query;

  let salesRows: BusinessSaleRow[] = (data ?? []) as BusinessSaleRow[];
  let total = count ?? 0;

  if (error) {
    if (!isBusinessSalesSchemaMismatch(error)) throw error;
    const legacy = await listLegacySales({
      supabase,
      ownerUserId: context.ownerUserId,
      page,
      pageSize,
      from,
      to,
      inventoryItemId: filters?.inventoryItemId,
      search: filters?.search,
    });
    salesRows = legacy.data;
    total = legacy.count;
  }

  const mappedSales = await attachInventoryTitles(
    context.businessAccountId,
    salesRows.map(toBusinessSale)
  );

  return {
    sales: mappedSales,
    page,
    pageSize,
    total,
  };
}

export async function createSale(
  userId: string,
  sale: SaleWriteInput
): Promise<BusinessSale> {
  const context = await requireBusinessAccess(userId);
  const supabase = await createClient();

  const inventoryContext = await getInventoryContextForSale({
    businessAccountId: context.businessAccountId,
    userId,
    ownerUserId: context.ownerUserId,
    inventoryItemId: sale.inventory_item_id,
  });

  if (sale.inventory_item_id && !inventoryContext) {
    const err = new Error("Inventory item not found for this business");
    (err as any).status = 400;
    throw err;
  }

  await ensureCollectionItemMirrorForSale(supabase, userId, inventoryContext);

  const insertPayload = buildComputedSalePayload({
    userId,
    businessAccountId: context.businessAccountId,
    legacyBusinessOwnerId: context.ownerUserId,
    base: sale,
    inventoryContext,
  });

  try {
    let created: BusinessSaleRow | null = null;

    const { data, error } = await supabase
      .from("business_sales")
      .insert(insertPayload)
      .select("*")
      .single();

    if (error) {
      if (!isBusinessSalesSchemaMismatch(error)) {
        normalizeBusinessSaleError(error);
      }
      const legacyPayload = buildLegacySalePayload(insertPayload);
      const { data: legacyData, error: legacyError } = await supabase
        .from("business_sales")
        .insert(legacyPayload)
        .select("*")
        .single();
      if (legacyError) normalizeBusinessSaleError(legacyError);
      created = legacyData as BusinessSaleRow;
    } else {
      created = data as BusinessSaleRow;
    }

    // Mark the linked inventory row as sold if present.
    if (insertPayload.inventory_item_id) {
      await markInventoryItemSold({
        supabase,
        inventoryItemId: insertPayload.inventory_item_id,
        businessAccountId: context.businessAccountId,
        userId,
        ownerUserId: context.ownerUserId,
      });
    }

    if (!created) {
      const err = new Error("Failed to create sale");
      (err as any).status = 500;
      throw err;
    }

    const [withTitles] = await attachInventoryTitles(context.businessAccountId, [
      toBusinessSale(created),
    ]);
    return withTitles;
  } catch (e) {
    normalizeBusinessSaleError(e);
  }
}

export async function updateSale(
  userId: string,
  saleId: string,
  updates: SaleWriteInput
): Promise<BusinessSale> {
  const context = await requireBusinessAccess(userId);
  const supabase = await createClient();
  let useLegacySchema = false;

  let existing: BusinessSaleRow | null = null;
  const { data: existingData, error: existingError } = await supabase
    .from("business_sales")
    .select("*")
    .eq("id", saleId)
    .eq("business_account_id", context.businessAccountId)
    .eq("is_deleted", false)
    .maybeSingle();

  if (existingError) {
    if (!isBusinessSalesSchemaMismatch(existingError)) throw existingError;
    useLegacySchema = true;
    const { data: legacyExisting, error: legacyExistingError } = await supabase
      .from("business_sales")
      .select("*")
      .eq("id", saleId)
      .eq("user_id", context.ownerUserId)
      .maybeSingle();
    if (legacyExistingError) throw legacyExistingError;
    existing = (legacyExisting as BusinessSaleRow | null) ?? null;
  } else {
    existing = (existingData as BusinessSaleRow | null) ?? null;
  }

  if (!existing) {
    const err = new Error("Sale not found");
    (err as any).status = 404;
    throw err;
  }

  const mergedBase: SaleWriteInput = {
    inventory_item_id: updates.inventory_item_id ?? existing.inventory_item_id,
    channel: updates.channel ?? existing.channel,
    sold_at: updates.sold_at ?? existing.sold_at ?? existing.sale_date,
    sold_price_cents: updates.sold_price_cents ?? existing.sold_price_cents ?? existing.sale_price_cents,
    shipping_charged_cents:
      updates.shipping_charged_cents ?? existing.shipping_charged_cents,
    platform_fees_cents:
      updates.platform_fees_cents ?? existing.platform_fees_cents,
    shipping_cost_cents:
      updates.shipping_cost_cents ?? existing.shipping_cost_cents ?? existing.shipping_paid_cents,
    tax_cents: updates.tax_cents ?? existing.tax_cents ?? existing.other_costs_cents,
    net_payout_cents: updates.net_payout_cents ?? undefined,
    cogs_cents: updates.cogs_cents ?? existing.cogs_cents,
    notes: updates.notes ?? existing.notes,
    external_order_id: updates.external_order_id ?? existing.external_order_id ?? existing.order_id,
  };

  const inventoryContext = await getInventoryContextForSale({
    businessAccountId: context.businessAccountId,
    userId,
    ownerUserId: context.ownerUserId,
    inventoryItemId: mergedBase.inventory_item_id,
  });

  await ensureCollectionItemMirrorForSale(supabase, userId, inventoryContext);

  const payload = buildComputedSalePayload({
    userId,
    businessAccountId: context.businessAccountId,
    legacyBusinessOwnerId: context.ownerUserId,
    base: mergedBase,
    inventoryContext,
  });

  let updated: BusinessSaleRow | null = null;
  if (!useLegacySchema) {
    const { data, error } = await supabase
      .from("business_sales")
      .update(payload)
      .eq("id", saleId)
      .eq("business_account_id", context.businessAccountId)
      .eq("is_deleted", false)
      .select("*")
      .single();

    if (error) {
      if (!isBusinessSalesSchemaMismatch(error)) throw error;
      useLegacySchema = true;
    } else {
      updated = data as BusinessSaleRow;
    }
  }

  if (useLegacySchema) {
    const legacyPayload = buildLegacySalePayload(payload);
    const { data, error } = await supabase
      .from("business_sales")
      .update(legacyPayload)
      .eq("id", saleId)
      .eq("user_id", context.ownerUserId)
      .select("*")
      .single();
    if (error) throw error;
    updated = data as BusinessSaleRow;
  }

  if (payload.inventory_item_id) {
    await supabase
      .from(BUSINESS_TABLE)
      .update({ status: "sold" })
      .eq("id", payload.inventory_item_id)
      .eq("business_account_id", context.businessAccountId);
  }

  if (!updated) {
    const err = new Error("Sale not found");
    (err as any).status = 404;
    throw err;
  }

  const [withTitles] = await attachInventoryTitles(context.businessAccountId, [
    toBusinessSale(updated),
  ]);
  return withTitles;
}

export async function deleteSale(userId: string, saleId: string): Promise<void> {
  const context = await requireBusinessAccess(userId);
  requireRole(
    context,
    ["owner", "manager"],
    "Only owners and managers can delete sales"
  );
  const supabase = await createClient();

  const { error } = await supabase
    .from("business_sales")
    .update({ is_deleted: true })
    .eq("id", saleId)
    .eq("business_account_id", context.businessAccountId);

  if (error) {
    if (!isBusinessSalesSchemaMismatch(error)) throw error;
    const { error: legacyDeleteError } = await supabase
      .from("business_sales")
      .delete()
      .eq("id", saleId)
      .eq("user_id", context.ownerUserId);
    if (legacyDeleteError) throw legacyDeleteError;
  }
}

// =============================================
// METRICS
// =============================================

/**
 * Aggregate sales KPIs for a date range using a direct query.
 * Used as the primary computation method (avoids dependency on an RPC function
 * that may not be deployed yet).
 */
async function aggregateSalesKpis(
  supabase: Awaited<ReturnType<typeof createClient>>,
  businessAccountId: string,
  from: string,
  to: string
): Promise<{ revenue_cents: number; profit_cents: number; sales_count: number }> {
  const { data, error } = await supabase
    .from("business_sales")
    .select("sold_price_cents, shipping_charged_cents, profit_cents")
    .eq("business_account_id", businessAccountId)
    .eq("is_deleted", false)
    .gte("sold_at", from)
    .lt("sold_at", to);

  if (error) throw error;

  const rows = data ?? [];
  let revenueCents = 0;
  let profitCents = 0;
  for (const row of rows) {
    revenueCents += toInt(row.sold_price_cents) + toInt(row.shipping_charged_cents);
    profitCents += toInt(row.profit_cents);
  }

  return {
    revenue_cents: revenueCents,
    profit_cents: profitCents,
    sales_count: rows.length,
  };
}

async function aggregateLegacySalesKpis(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ownerUserId: string,
  from: string,
  to: string
): Promise<{ revenue_cents: number; profit_cents: number; sales_count: number }> {
  const fromDate = from.slice(0, 10);
  const toDate = to.slice(0, 10);
  const { data, error } = await supabase
    .from("business_sales")
    .select("sale_price_cents, shipping_charged_cents, profit_cents")
    .eq("user_id", ownerUserId)
    .gte("sale_date", fromDate)
    .lte("sale_date", toDate);

  if (error) throw error;

  const rows = data ?? [];
  let revenueCents = 0;
  let profitCents = 0;
  for (const row of rows) {
    revenueCents += toInt(row.sale_price_cents) + toInt(row.shipping_charged_cents);
    profitCents += toInt(row.profit_cents);
  }

  return {
    revenue_cents: revenueCents,
    profit_cents: profitCents,
    sales_count: rows.length,
  };
}

export async function getBusinessMetrics(userId: string): Promise<BusinessMetrics> {
  const context = await requireBusinessAccess(userId);
  const supabase = await createClient();

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const rangeEnd = new Date(now.getTime() + 1000);

  const zeroAgg = {
    revenue_cents: 0,
    profit_cents: 0,
    sales_count: 0,
  } as { revenue_cents: number; profit_cents: number; sales_count: number };

  let mtd = zeroAgg;
  let ytd = zeroAgg;

  try {
    [mtd, ytd] = await Promise.all([
      aggregateSalesKpis(
        supabase,
        context.businessAccountId,
        monthStart.toISOString(),
        rangeEnd.toISOString()
      ),
      aggregateSalesKpis(
        supabase,
        context.businessAccountId,
        yearStart.toISOString(),
        rangeEnd.toISOString()
      ),
    ]);
  } catch (error) {
    if (isBusinessSalesSchemaMismatch(error)) {
      try {
        [mtd, ytd] = await Promise.all([
          aggregateLegacySalesKpis(
            supabase,
            context.ownerUserId,
            monthStart.toISOString(),
            rangeEnd.toISOString()
          ),
          aggregateLegacySalesKpis(
            supabase,
            context.ownerUserId,
            yearStart.toISOString(),
            rangeEnd.toISOString()
          ),
        ]);
      } catch {
        mtd = zeroAgg;
        ytd = zeroAgg;
      }
    } else {
      mtd = zeroAgg;
      ytd = zeroAgg;
    }
  }

  // Active inventory count
  const { count: activeCount } = await supabase
    .from(BUSINESS_TABLE)
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("item_kind", BUSINESS_ITEM_KIND)
    .neq("status", "sold");

  return {
    revenueMtd: toInt(mtd.revenue_cents),
    revenueYtd: toInt(ytd.revenue_cents),
    profitMtd: toInt(mtd.profit_cents),
    profitYtd: toInt(ytd.profit_cents),
    salesCountMtd: toInt(mtd.sales_count),
    salesCountYtd: toInt(ytd.sales_count),
    activeInventoryCount: activeCount ?? 0,
  };
}

// =============================================
// CSV EXPORT
// =============================================

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

export function inventoryToCsv(items: BusinessInventoryItem[]): string {
  const headers = [
    "title",
    "quantity",
    "status",
    "channel",
    "condition_status",
    "grading_company",
    "grade",
    "cert_number",
    "acquisition_type",
    "acquisition_date",
    "cost_basis_total_cents",
    "tax_cents",
    "shipping_cents",
    "fees_paid_cents",
    "list_price_cents",
    "current_market_value_cents",
    "location",
    "notes",
    "created_at",
  ];

  const rows = items.map((it) => headers.map((h) => csvEscape((it as any)[h])));

  return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
}

export function salesToCsv(sales: BusinessSale[]): string {
  const headers = [
    "sold_at",
    "inventory_item_id",
    "channel",
    "sold_price_cents",
    "shipping_charged_cents",
    "platform_fees_cents",
    "shipping_cost_cents",
    "tax_cents",
    "net_payout_cents",
    "cogs_cents",
    "profit_cents",
    "external_order_id",
    "notes",
    "created_at",
  ];

  const rows = sales.map((s) => headers.map((h) => csvEscape((s as any)[h])));

  return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
}
