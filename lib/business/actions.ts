import { createClient } from "@/lib/supabase/server";
import { hasBusinessAccess } from "@/lib/access";
import type { BusinessInventoryItem, BusinessSale, BusinessMetrics } from "@/types";
import { computeNetPayout, computeProfit } from "@/lib/business/sales-utils";

// Uses business_inventory_items table (unified collection_items migration not yet applied)
const BUSINESS_TABLE = "business_inventory_items" as const;

type BusinessInventoryRow = {
  id: string;
  user_id: string;
  card_id: string | null;
  title: string;
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
  location: string | null;
  channel: string | null;
  status: string | null;
  list_price_cents: number | null;
  current_market_value_cents: number | null;
  user_image_url: string | null;
  stock_image_url: string | null;
  ebay_image_url: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string | null;
};

/**
 * Require Business access, throwing a structured error if not.
 */
export async function requireBusinessAccess(userId: string): Promise<void> {
  const ok = await hasBusinessAccess(userId);
  if (!ok) {
    const err = new Error("Business subscription required");
    (err as any).status = 403;
    throw err;
  }
}

function dollarsToCents(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

function centsToDollars(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value / 100;
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
    card_id: row.card_id || row.id,
    title: row.title || "Untitled item",
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
    location: row.location,
    channel: normalizeChannel(row.channel),
    status: normalizeStatus(row.status),
    list_price_cents: row.list_price_cents ?? null,
    current_market_value_cents: row.current_market_value_cents ?? null,
    user_image_url: row.user_image_url ?? null,
    stock_image_url: row.stock_image_url ?? null,
    ebay_image_url: row.ebay_image_url ?? null,
    notes: row.notes,
    created_at: row.created_at,
    updated_at: row.updated_at || row.created_at,
  };
}

function buildInventoryInsertPayload(
  userId: string,
  item: Omit<BusinessInventoryItem, "id" | "user_id" | "created_at" | "updated_at">
): Record<string, unknown> {
  return {
    user_id: userId,
    card_id: normalizeCardId((item as any).card_id),
    title: item.title || "Untitled item",
    quantity: normalizeQuantity(item.quantity),
    acquisition_type: item.acquisition_type ?? "other",
    acquisition_date: normalizeAcquisitionDate(item.acquisition_date),
    cost_basis_total_cents: item.cost_basis_total_cents ?? 0,
    tax_cents: item.tax_cents ?? 0,
    shipping_cents: item.shipping_cents ?? 0,
    fees_paid_cents: item.fees_paid_cents ?? 0,
    condition_status: item.condition_status ?? "raw",
    grading_company: item.grading_company || null,
    grade: item.grade || null,
    cert_number: item.cert_number || null,
    location: item.location || null,
    channel: item.channel ?? "other",
    status: item.status ?? "unlisted",
    list_price_cents: item.list_price_cents ?? null,
    current_market_value_cents: item.current_market_value_cents ?? null,
    user_image_url: (item as any).user_image_url || null,
    stock_image_url: (item as any).stock_image_url || null,
    ebay_image_url: (item as any).ebay_image_url || null,
    notes: item.notes || null,
  };
}

function buildInventoryUpdatePayload(
  updates: Partial<
    Omit<BusinessInventoryItem, "id" | "user_id" | "created_at" | "updated_at">
  >
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
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
    payload.grading_company = updates.grading_company;
  if (updates.grade !== undefined) payload.grade = updates.grade;
  if (updates.cert_number !== undefined) payload.cert_number = updates.cert_number;
  if (updates.location !== undefined) payload.location = updates.location;
  if (updates.channel !== undefined) payload.channel = updates.channel;
  if (updates.status !== undefined) payload.status = updates.status;
  if (updates.list_price_cents !== undefined)
    payload.list_price_cents = updates.list_price_cents;
  if (updates.current_market_value_cents !== undefined)
    payload.current_market_value_cents = updates.current_market_value_cents;
  if (updates.notes !== undefined) payload.notes = updates.notes;
  if (updates.user_image_url !== undefined)
    payload.user_image_url = updates.user_image_url;
  if (updates.stock_image_url !== undefined)
    payload.stock_image_url = updates.stock_image_url;
  if (updates.ebay_image_url !== undefined)
    payload.ebay_image_url = updates.ebay_image_url;
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
  await requireBusinessAccess(userId);
  const supabase = await createClient();

  let query = supabase
    .from(BUSINESS_TABLE)
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (filters?.status) query = query.eq("status", filters.status);
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

  return ((data ?? []) as BusinessInventoryRow[]).map(toBusinessInventoryItem);
}

export async function getInventoryItem(
  userId: string,
  itemId: string
): Promise<BusinessInventoryItem | null> {
  await requireBusinessAccess(userId);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from(BUSINESS_TABLE)
    .select("*")
    .eq("id", itemId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error && error.code !== "PGRST116") throw error;
  if (!data) return null;
  return toBusinessInventoryItem(data as BusinessInventoryRow);
}

export async function createInventoryItem(
  userId: string,
  item: Omit<BusinessInventoryItem, "id" | "user_id" | "created_at" | "updated_at">
): Promise<BusinessInventoryItem> {
  await requireBusinessAccess(userId);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from(BUSINESS_TABLE)
    .insert(buildInventoryInsertPayload(userId, item))
    .select("*")
    .single();

  if (error) throw error;
  return toBusinessInventoryItem(data as BusinessInventoryRow);
}

export async function updateInventoryItem(
  userId: string,
  itemId: string,
  updates: Partial<Omit<BusinessInventoryItem, "id" | "user_id" | "created_at" | "updated_at">>
): Promise<BusinessInventoryItem> {
  await requireBusinessAccess(userId);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from(BUSINESS_TABLE)
    .update(buildInventoryUpdatePayload(updates))
    .eq("id", itemId)
    .eq("user_id", userId)
    .select("*")
    .single();

  if (error) throw error;
  return toBusinessInventoryItem(data as BusinessInventoryRow);
}

export async function deleteInventoryItems(
  userId: string,
  itemIds: string[]
): Promise<void> {
  await requireBusinessAccess(userId);
  const supabase = await createClient();

  const { error } = await supabase
    .from(BUSINESS_TABLE)
    .delete()
    .in("id", itemIds)
    .eq("user_id", userId);

  if (error) throw error;
}

export async function bulkUpdateInventory(
  userId: string,
  itemIds: string[],
  updates: { status?: string; location?: string }
): Promise<void> {
  await requireBusinessAccess(userId);
  const supabase = await createClient();

  const payload: Record<string, unknown> = {};
  if (updates.status !== undefined) payload.status = updates.status;
  if (updates.location !== undefined) payload.location = updates.location;

  const { error } = await supabase
    .from(BUSINESS_TABLE)
    .update(payload)
    .in("id", itemIds)
    .eq("user_id", userId);

  if (error) throw error;
}

// =============================================
// SALES CRUD
// =============================================

type BusinessSaleRow = {
  id: string;
  user_id: string;
  business_id: string;
  inventory_item_id: string | null;
  channel: string | null;
  sold_at: string;
  sold_price_cents: number | null;
  shipping_charged_cents: number | null;
  platform_fees_cents: number | null;
  shipping_cost_cents: number | null;
  tax_cents: number | null;
  net_payout_cents: number | null;
  cogs_cents: number | null;
  profit_cents: number | null;
  notes: string | null;
  external_order_id: string | null;
  is_deleted: boolean | null;
  created_at: string;
  updated_at: string;
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

function toBusinessSale(row: BusinessSaleRow): BusinessSale {
  const soldPriceCents = toInt(row.sold_price_cents);
  const shippingChargedCents = toInt(row.shipping_charged_cents);
  const platformFeesCents = toInt(row.platform_fees_cents);
  const shippingCostCents = toInt(row.shipping_cost_cents);
  const taxCents = toInt(row.tax_cents);
  const cogsCents = toInt(row.cogs_cents);
  const netPayoutCents = toInt(
    row.net_payout_cents ??
      computeNetPayout({
        sold_price_cents: soldPriceCents,
        shipping_charged_cents: shippingChargedCents,
        platform_fees_cents: platformFeesCents,
        shipping_cost_cents: shippingCostCents,
        tax_cents: taxCents,
      })
  );

  const grossRevenueCents = soldPriceCents + shippingChargedCents;

  return {
    id: row.id,
    user_id: row.user_id,
    business_id: row.business_id || row.user_id,
    inventory_item_id: row.inventory_item_id,
    channel: normalizeChannel(row.channel),
    sold_at: row.sold_at,
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
    external_order_id: row.external_order_id,
    notes: row.notes,
    is_deleted: Boolean(row.is_deleted),
    inventory_item: null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function attachInventoryTitles(
  userId: string,
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

  const supabase = await createClient();
  const { data, error } = await supabase
    .from(BUSINESS_TABLE)
    .select("id, title")
    .in("id", inventoryIds)
    .eq("user_id", userId);
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
  userId: string,
  inventoryItemId?: string | null
): Promise<{ id: string; title: string | null; channel: string | null; cost_basis_total_cents: number | null } | null> {
  if (!inventoryItemId) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from(BUSINESS_TABLE)
    .select("id, title, channel, cost_basis_total_cents")
    .eq("id", inventoryItemId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    id: data.id,
    title: data.title ?? null,
    channel: data.channel ?? null,
    cost_basis_total_cents: data.cost_basis_total_cents ?? 0,
  };
}

/**
 * Ensure a minimal collection_items mirror row exists for inventory-backed sales.
 * This supports deployments where business_sales.inventory_item_id references collection_items(id).
 */
async function ensureCollectionItemMirrorForSale(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  inventoryContext: { id: string; title: string | null } | null
): Promise<void> {
  if (!inventoryContext) return;

  const label = inventoryContext.title?.trim() || "Inventory Item";
  const { error } = await supabase
    .from("collection_items")
    .upsert(
      {
        id: inventoryContext.id,
        user_id: userId,
        player_name: label,
        notes: "Auto-linked from business inventory for sale record consistency",
      },
      { onConflict: "id", ignoreDuplicates: true }
    );

  if (!error) return;

  const code = String((error as { code?: string })?.code ?? "");
  const message = String((error as { message?: string })?.message ?? "");
  const details = String((error as { details?: string })?.details ?? "");
  const combined = `${message} ${details}`.toLowerCase();

  // Older deployments may not have collection_items; in those schemas this mirror is unnecessary.
  if (
    code === "PGRST205" ||
    (combined.includes("collection_items") &&
      (combined.includes("not exist") || combined.includes("could not find")))
  ) {
    return;
  }

  // Mirror row already exists.
  if (code === "23505") return;

  throw error;
}

function buildComputedSalePayload(args: {
  userId: string;
  base: SaleWriteInput;
  inventoryContext: { id: string; channel: string | null; cost_basis_total_cents: number | null } | null;
}) {
  const { userId, base, inventoryContext } = args;

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
    business_id: userId,
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
  await requireBusinessAccess(userId);
  const supabase = await createClient();

  const page = Math.max(filters?.page ?? 1, 1);
  const pageSize = Math.min(Math.max(filters?.pageSize ?? 50, 1), 200);
  const from = filters?.from ?? filters?.startDate;
  const to = filters?.to ?? filters?.endDate;

  let query = supabase
    .from("business_sales")
    .select(
      "id,user_id,business_id,inventory_item_id,channel,sold_at,sold_price_cents,shipping_charged_cents,platform_fees_cents,shipping_cost_cents,tax_cents,net_payout_cents,cogs_cents,profit_cents,notes,external_order_id,is_deleted,created_at,updated_at",
      { count: "exact" }
    )
    .eq("business_id", userId)
    .eq("is_deleted", false)
    .order("sold_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (filters?.inventoryItemId)
    query = query.eq("inventory_item_id", filters.inventoryItemId);
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
        .eq("user_id", userId)
        .ilike("title", `%${q}%`)
        .limit(200);

      const inventoryIds = (inventoryMatches ?? [])
        .map((row: { id: string | null }) => row.id)
        .filter((value: string | null): value is string => Boolean(value));
      const escapedQ = q.replace(/%/g, "\\%").replace(/,/g, " ");

      if (inventoryIds.length > 0) {
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
  if (error) throw error;
  const mappedSales = await attachInventoryTitles(
    userId,
    ((data ?? []) as BusinessSaleRow[]).map(toBusinessSale)
  );

  return {
    sales: mappedSales,
    page,
    pageSize,
    total: count ?? 0,
  };
}

export async function createSale(
  userId: string,
  sale: SaleWriteInput
): Promise<BusinessSale> {
  await requireBusinessAccess(userId);
  const supabase = await createClient();

  const inventoryContext = await getInventoryContextForSale(
    userId,
    sale.inventory_item_id
  );

  if (sale.inventory_item_id && !inventoryContext) {
    const err = new Error("Inventory item not found for this business");
    (err as any).status = 400;
    throw err;
  }

  const insertPayload = buildComputedSalePayload({
    userId,
    base: sale,
    inventoryContext,
  });

  try {
    await ensureCollectionItemMirrorForSale(supabase, userId, inventoryContext);

    const { data, error } = await supabase
      .from("business_sales")
      .insert(insertPayload)
      .select(
        "id,user_id,business_id,inventory_item_id,channel,sold_at,sold_price_cents,shipping_charged_cents,platform_fees_cents,shipping_cost_cents,tax_cents,net_payout_cents,cogs_cents,profit_cents,notes,external_order_id,is_deleted,created_at,updated_at"
      )
      .single();

    if (error) normalizeBusinessSaleError(error);

    // Mark the linked inventory row as sold if present.
    if (insertPayload.inventory_item_id) {
      const { error: updateError } = await supabase
        .from(BUSINESS_TABLE)
        .update({ status: "sold" })
        .eq("id", insertPayload.inventory_item_id)
        .eq("user_id", userId);
      if (updateError) normalizeBusinessSaleError(updateError);
    }

    const [withTitles] = await attachInventoryTitles(userId, [
      toBusinessSale(data as BusinessSaleRow),
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
  await requireBusinessAccess(userId);
  const supabase = await createClient();

  const { data: existing, error: existingError } = await supabase
    .from("business_sales")
    .select("*")
    .eq("id", saleId)
    .eq("business_id", userId)
    .eq("is_deleted", false)
    .maybeSingle();

  if (existingError) throw existingError;
  if (!existing) {
    const err = new Error("Sale not found");
    (err as any).status = 404;
    throw err;
  }

  const mergedBase: SaleWriteInput = {
    inventory_item_id: updates.inventory_item_id ?? existing.inventory_item_id,
    channel: updates.channel ?? existing.channel,
    sold_at: updates.sold_at ?? existing.sold_at,
    sold_price_cents: updates.sold_price_cents ?? existing.sold_price_cents,
    shipping_charged_cents:
      updates.shipping_charged_cents ?? existing.shipping_charged_cents,
    platform_fees_cents:
      updates.platform_fees_cents ?? existing.platform_fees_cents,
    shipping_cost_cents: updates.shipping_cost_cents ?? existing.shipping_cost_cents,
    tax_cents: updates.tax_cents ?? existing.tax_cents,
    net_payout_cents: updates.net_payout_cents ?? undefined,
    cogs_cents: updates.cogs_cents ?? existing.cogs_cents,
    notes: updates.notes ?? existing.notes,
    external_order_id: updates.external_order_id ?? existing.external_order_id,
  };

  const inventoryContext = await getInventoryContextForSale(
    userId,
    mergedBase.inventory_item_id
  );

  const payload = buildComputedSalePayload({
    userId,
    base: mergedBase,
    inventoryContext,
  });

  await ensureCollectionItemMirrorForSale(supabase, userId, inventoryContext);

  const { data, error } = await supabase
    .from("business_sales")
    .update(payload)
    .eq("id", saleId)
    .eq("business_id", userId)
    .eq("is_deleted", false)
    .select(
      "id,user_id,business_id,inventory_item_id,channel,sold_at,sold_price_cents,shipping_charged_cents,platform_fees_cents,shipping_cost_cents,tax_cents,net_payout_cents,cogs_cents,profit_cents,notes,external_order_id,is_deleted,created_at,updated_at"
    )
    .single();

  if (error) throw error;

  if (payload.inventory_item_id) {
    await supabase
      .from(BUSINESS_TABLE)
      .update({ status: "sold" })
      .eq("id", payload.inventory_item_id)
      .eq("user_id", userId);
  }

  const [withTitles] = await attachInventoryTitles(userId, [
    toBusinessSale(data as BusinessSaleRow),
  ]);
  return withTitles;
}

export async function deleteSale(userId: string, saleId: string): Promise<void> {
  await requireBusinessAccess(userId);
  const supabase = await createClient();

  const { error } = await supabase
    .from("business_sales")
    .update({ is_deleted: true })
    .eq("id", saleId)
    .eq("business_id", userId);

  if (error) throw error;
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
  businessId: string,
  from: string,
  to: string
): Promise<{ revenue_cents: number; profit_cents: number; sales_count: number }> {
  const { data, error } = await supabase
    .from("business_sales")
    .select("sold_price_cents, shipping_charged_cents, profit_cents")
    .eq("business_id", businessId)
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

export async function getBusinessMetrics(userId: string): Promise<BusinessMetrics> {
  await requireBusinessAccess(userId);
  const supabase = await createClient();

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const rangeEnd = new Date(now.getTime() + 1000);

  const [mtdAgg, ytdAgg] = await Promise.all([
    supabase.rpc("get_business_kpis_agg", {
      p_business_id: userId,
      p_from: monthStart.toISOString(),
      p_to: rangeEnd.toISOString(),
    }),
    supabase.rpc("get_business_kpis_agg", {
      p_business_id: userId,
      p_from: yearStart.toISOString(),
      p_to: rangeEnd.toISOString(),
    }),
  ]);

  // If RPC is missing or fails (e.g. migration not run), use zeros so active inventory still loads
  const mtd =
    mtdAgg.error || !mtdAgg.data?.[0]
      ? ({ revenue_cents: 0, profit_cents: 0, sales_count: 0 } as { revenue_cents: number; profit_cents: number; sales_count: number })
      : (mtdAgg.data[0] as { revenue_cents: number; profit_cents: number; sales_count: number });
  const ytd =
    ytdAgg.error || !ytdAgg.data?.[0]
      ? ({ revenue_cents: 0, profit_cents: 0, sales_count: 0 } as { revenue_cents: number; profit_cents: number; sales_count: number })
      : (ytdAgg.data[0] as { revenue_cents: number; profit_cents: number; sales_count: number });

  // Active inventory count
  const { count: activeCount } = await supabase
    .from(BUSINESS_TABLE)
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
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
