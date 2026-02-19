import { createClient, createServiceClient } from "@/lib/supabase/server";
import { hasBusinessAccess } from "@/lib/access";
import type { BusinessInventoryItem, BusinessSale, BusinessMetrics } from "@/types";

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
    .from("business_inventory_items")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (filters?.status) query = query.eq("status", filters.status);
  if (filters?.channel) query = query.eq("channel", filters.channel);
  if (filters?.condition_status)
    query = query.eq("condition_status", filters.condition_status);
  if (filters?.search)
    query = query.ilike("title", `%${filters.search}%`);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as BusinessInventoryItem[];
}

export async function getInventoryItem(
  userId: string,
  itemId: string
): Promise<BusinessInventoryItem | null> {
  await requireBusinessAccess(userId);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("business_inventory_items")
    .select("*")
    .eq("id", itemId)
    .eq("user_id", userId)
    .single();

  if (error && error.code !== "PGRST116") throw error;
  return data as BusinessInventoryItem | null;
}

export async function createInventoryItem(
  userId: string,
  item: Omit<BusinessInventoryItem, "id" | "user_id" | "created_at" | "updated_at">
): Promise<BusinessInventoryItem> {
  await requireBusinessAccess(userId);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("business_inventory_items")
    .insert({ ...item, user_id: userId })
    .select()
    .single();

  if (error) throw error;
  return data as BusinessInventoryItem;
}

export async function updateInventoryItem(
  userId: string,
  itemId: string,
  updates: Partial<Omit<BusinessInventoryItem, "id" | "user_id" | "created_at" | "updated_at">>
): Promise<BusinessInventoryItem> {
  await requireBusinessAccess(userId);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("business_inventory_items")
    .update(updates)
    .eq("id", itemId)
    .eq("user_id", userId)
    .select()
    .single();

  if (error) throw error;
  return data as BusinessInventoryItem;
}

export async function deleteInventoryItems(
  userId: string,
  itemIds: string[]
): Promise<void> {
  await requireBusinessAccess(userId);
  const supabase = await createClient();

  const { error } = await supabase
    .from("business_inventory_items")
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

  const { error } = await supabase
    .from("business_inventory_items")
    .update(updates)
    .in("id", itemIds)
    .eq("user_id", userId);

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
  sale: Omit<BusinessSale, "id" | "user_id" | "net_proceeds_cents" | "profit_cents" | "created_at" | "updated_at">
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
    .from("business_inventory_items")
    .update({ status: "sold" })
    .eq("id", sale.inventory_item_id)
    .eq("user_id", userId);

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

export async function deleteSale(
  userId: string,
  saleId: string
): Promise<void> {
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

export async function getBusinessMetrics(
  userId: string
): Promise<BusinessMetrics> {
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
    .from("business_inventory_items")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
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

  const rows = items.map((it) =>
    headers.map((h) => csvEscape((it as any)[h]))
  );

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

  const rows = sales.map((s) =>
    headers.map((h) => csvEscape((s as any)[h]))
  );

  return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
}
