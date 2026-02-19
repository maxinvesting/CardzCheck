import { createClient } from "@/lib/supabase/server";
import { hasBusinessAccess } from "@/lib/access";
import type { BusinessInventoryItem, BusinessSale, BusinessMetrics } from "@/types";

const INVENTORY_ITEM_KINDS = ["inventory", "prospect"] as const;

type CollectionInventoryRow = {
  id: string;
  user_id: string;
  item_kind: string | null;
  title: string | null;
  player_name: string | null;
  year: string | null;
  set_name: string | null;
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
  target_price: number | null;
  notes: string | null;
  purchase_price: number | null;
  purchase_date: string | null;
  est_cmv: number | null;
  estimated_cmv: number | null;
  created_at: string;
  updated_at?: string | null;
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
  if (normalized === "raw" || normalized === "graded") {
    return normalized;
  }
  return grade ? "graded" : "raw";
}

function deriveTitle(row: CollectionInventoryRow): string {
  if (row.title && row.title.trim().length > 0) return row.title;
  const display = [row.year, row.player_name, row.set_name, row.grade]
    .filter(Boolean)
    .join(" ")
    .trim();
  if (display.length > 0) return display;
  return row.player_name || "Untitled card";
}

function toBusinessInventoryItem(row: CollectionInventoryRow): BusinessInventoryItem {
  const inferredCostBasis = dollarsToCents(row.purchase_price) ?? 0;
  const inferredCmv =
    row.current_market_value_cents ??
    dollarsToCents(row.est_cmv) ??
    dollarsToCents(row.estimated_cmv);

  return {
    id: row.id,
    user_id: row.user_id,
    card_id: row.id,
    title: deriveTitle(row),
    quantity: row.quantity ?? 1,
    acquisition_date: row.acquisition_date ?? row.purchase_date ?? null,
    acquisition_type: normalizeAcquisitionType(row.acquisition_type),
    cost_basis_total_cents: row.cost_basis_total_cents ?? inferredCostBasis,
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
    list_price_cents: row.list_price_cents ?? dollarsToCents(row.target_price),
    current_market_value_cents: inferredCmv ?? null,
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
    item_kind: "inventory",
    title: item.title,
    player_name: item.title || "Inventory Item",
    quantity: item.quantity ?? 1,
    acquisition_type: item.acquisition_type ?? "other",
    acquisition_date: item.acquisition_date,
    purchase_date: item.acquisition_date,
    purchase_price: centsToDollars(item.cost_basis_total_cents),
    cost_basis_total_cents: item.cost_basis_total_cents ?? 0,
    tax_cents: item.tax_cents ?? 0,
    shipping_cents: item.shipping_cents ?? 0,
    fees_paid_cents: item.fees_paid_cents ?? 0,
    condition_status: item.condition_status ?? "raw",
    grading_company: item.grading_company,
    grade: item.grade,
    cert_number: item.cert_number,
    location: item.location,
    channel: item.channel ?? "other",
    status: item.status ?? "unlisted",
    list_price_cents: item.list_price_cents,
    target_price: centsToDollars(item.list_price_cents),
    current_market_value_cents: item.current_market_value_cents,
    estimated_cmv: centsToDollars(item.current_market_value_cents),
    est_cmv: centsToDollars(item.current_market_value_cents),
    notes: item.notes,
  };
}

function buildInventoryUpdatePayload(
  updates: Partial<
    Omit<BusinessInventoryItem, "id" | "user_id" | "created_at" | "updated_at">
  >
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (updates.title !== undefined) {
    payload.title = updates.title;
    payload.player_name = updates.title || "Inventory Item";
  }
  if (updates.quantity !== undefined) payload.quantity = updates.quantity;
  if (updates.acquisition_type !== undefined)
    payload.acquisition_type = updates.acquisition_type;
  if (updates.acquisition_date !== undefined) {
    payload.acquisition_date = updates.acquisition_date;
    payload.purchase_date = updates.acquisition_date;
  }
  if (updates.cost_basis_total_cents !== undefined) {
    payload.cost_basis_total_cents = updates.cost_basis_total_cents;
    payload.purchase_price = centsToDollars(updates.cost_basis_total_cents);
  }
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
  if (updates.list_price_cents !== undefined) {
    payload.list_price_cents = updates.list_price_cents;
    payload.target_price = centsToDollars(updates.list_price_cents);
  }
  if (updates.current_market_value_cents !== undefined) {
    payload.current_market_value_cents = updates.current_market_value_cents;
    payload.estimated_cmv = centsToDollars(updates.current_market_value_cents);
    payload.est_cmv = centsToDollars(updates.current_market_value_cents);
  }
  if (updates.notes !== undefined) payload.notes = updates.notes;
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
    .from("collection_items")
    .select("*")
    .eq("user_id", userId)
    .in("item_kind", [...INVENTORY_ITEM_KINDS])
    .order("created_at", { ascending: false });

  if (filters?.status) query = query.eq("status", filters.status);
  if (filters?.channel) query = query.eq("channel", filters.channel);
  if (filters?.condition_status)
    query = query.eq("condition_status", filters.condition_status);
  if (filters?.search) {
    const search = filters.search.replace(/,/g, " ").trim();
    if (search.length > 0) {
      query = query.or(
        `title.ilike.%${search}%,player_name.ilike.%${search}%,set_name.ilike.%${search}%`
      );
    }
  }

  const { data, error } = await query;
  if (error) throw error;

  return ((data ?? []) as CollectionInventoryRow[]).map(toBusinessInventoryItem);
}

export async function getInventoryItem(
  userId: string,
  itemId: string
): Promise<BusinessInventoryItem | null> {
  await requireBusinessAccess(userId);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("collection_items")
    .select("*")
    .eq("id", itemId)
    .eq("user_id", userId)
    .in("item_kind", [...INVENTORY_ITEM_KINDS])
    .maybeSingle();

  if (error && error.code !== "PGRST116") throw error;
  if (!data) return null;
  return toBusinessInventoryItem(data as CollectionInventoryRow);
}

export async function createInventoryItem(
  userId: string,
  item: Omit<BusinessInventoryItem, "id" | "user_id" | "created_at" | "updated_at">
): Promise<BusinessInventoryItem> {
  await requireBusinessAccess(userId);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("collection_items")
    .insert(buildInventoryInsertPayload(userId, item))
    .select("*")
    .single();

  if (error) throw error;
  return toBusinessInventoryItem(data as CollectionInventoryRow);
}

export async function updateInventoryItem(
  userId: string,
  itemId: string,
  updates: Partial<Omit<BusinessInventoryItem, "id" | "user_id" | "created_at" | "updated_at">>
): Promise<BusinessInventoryItem> {
  await requireBusinessAccess(userId);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("collection_items")
    .update(buildInventoryUpdatePayload(updates))
    .eq("id", itemId)
    .eq("user_id", userId)
    .in("item_kind", [...INVENTORY_ITEM_KINDS])
    .select("*")
    .single();

  if (error) throw error;
  return toBusinessInventoryItem(data as CollectionInventoryRow);
}

export async function deleteInventoryItems(
  userId: string,
  itemIds: string[]
): Promise<void> {
  await requireBusinessAccess(userId);
  const supabase = await createClient();

  const { error } = await supabase
    .from("collection_items")
    .delete()
    .in("id", itemIds)
    .eq("user_id", userId)
    .in("item_kind", [...INVENTORY_ITEM_KINDS]);

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
    .from("collection_items")
    .update(payload)
    .in("id", itemIds)
    .eq("user_id", userId)
    .in("item_kind", [...INVENTORY_ITEM_KINDS]);

  if (error) throw error;
}

// =============================================
// SALES CRUD
// =============================================

export async function listSales(
  userId: string,
  filters?: {
    inventoryItemId?: string;
    startDate?: string;
    endDate?: string;
  }
): Promise<BusinessSale[]> {
  await requireBusinessAccess(userId);
  const supabase = await createClient();

  let query = supabase
    .from("business_sales")
    .select("*")
    .eq("user_id", userId)
    .order("sale_date", { ascending: false });

  if (filters?.inventoryItemId)
    query = query.eq("inventory_item_id", filters.inventoryItemId);
  if (filters?.startDate)
    query = query.gte("sale_date", filters.startDate);
  if (filters?.endDate)
    query = query.lte("sale_date", filters.endDate);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as BusinessSale[];
}

export async function createSale(
  userId: string,
  sale: Omit<
    BusinessSale,
    "id" | "user_id" | "net_proceeds_cents" | "profit_cents" | "created_at" | "updated_at"
  >
): Promise<BusinessSale> {
  await requireBusinessAccess(userId);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("business_sales")
    .insert({ ...sale, user_id: userId })
    .select()
    .single();

  if (error) throw error;

  // Mark the inventory item as sold
  await supabase
    .from("collection_items")
    .update({ status: "sold" })
    .eq("id", sale.inventory_item_id)
    .eq("user_id", userId)
    .in("item_kind", [...INVENTORY_ITEM_KINDS]);

  return data as BusinessSale;
}

export async function updateSale(
  userId: string,
  saleId: string,
  updates: Partial<Omit<BusinessSale, "id" | "user_id" | "created_at" | "updated_at">>
): Promise<BusinessSale> {
  await requireBusinessAccess(userId);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("business_sales")
    .update(updates)
    .eq("id", saleId)
    .eq("user_id", userId)
    .select()
    .single();

  if (error) throw error;
  return data as BusinessSale;
}

export async function deleteSale(userId: string, saleId: string): Promise<void> {
  await requireBusinessAccess(userId);
  const supabase = await createClient();

  const { error } = await supabase
    .from("business_sales")
    .delete()
    .eq("id", saleId)
    .eq("user_id", userId);

  if (error) throw error;
}

// =============================================
// METRICS
// =============================================

export async function getBusinessMetrics(userId: string): Promise<BusinessMetrics> {
  await requireBusinessAccess(userId);
  const supabase = await createClient();

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .slice(0, 10);
  const yearStart = `${now.getFullYear()}-01-01`;

  // Revenue + profit MTD
  const { data: mtdSales } = await supabase
    .from("business_sales")
    .select("sale_price_cents, net_proceeds_cents, profit_cents")
    .eq("user_id", userId)
    .gte("sale_date", monthStart);

  // Revenue + profit YTD
  const { data: ytdSales } = await supabase
    .from("business_sales")
    .select("sale_price_cents, net_proceeds_cents, profit_cents")
    .eq("user_id", userId)
    .gte("sale_date", yearStart);

  // Active inventory count
  const { count: activeCount } = await supabase
    .from("collection_items")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .in("item_kind", [...INVENTORY_ITEM_KINDS])
    .neq("status", "sold");

  const sum = (rows: any[] | null, field: string) =>
    (rows ?? []).reduce((acc: number, r: any) => acc + (r[field] ?? 0), 0);

  return {
    revenueMtd: sum(mtdSales, "sale_price_cents"),
    revenueYtd: sum(ytdSales, "sale_price_cents"),
    profitMtd: sum(mtdSales, "profit_cents"),
    profitYtd: sum(ytdSales, "profit_cents"),
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
    "sale_date",
    "inventory_item_id",
    "sale_price_cents",
    "platform_fees_cents",
    "shipping_charged_cents",
    "shipping_paid_cents",
    "other_costs_cents",
    "net_proceeds_cents",
    "profit_cents",
    "order_id",
    "buyer_handle",
    "notes",
    "created_at",
  ];

  const rows = sales.map((s) => headers.map((h) => csvEscape((s as any)[h])));

  return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
}

