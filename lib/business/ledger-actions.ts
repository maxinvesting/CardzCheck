import type { BusinessContext } from "@/types";
import { reverseCashBySource } from "@/lib/business/cash";

const BUSINESS_TABLE = "collection_items" as const;
const LEDGER_ACTIONS_TABLE = "business_ledger_actions" as const;

export type BusinessLedgerActionType =
  | "inventory_create"
  | "inventory_bulk_create"
  | "inventory_update"
  | "inventory_bulk_update"
  | "inventory_delete"
  | "sale_create"
  | "trade_create";

export type InventorySnapshot = Record<string, unknown> & { id?: string };

export interface BusinessLedgerAction {
  id: string;
  user_id: string;
  business_account_id: string;
  action_type: BusinessLedgerActionType;
  label: string;
  payload: Record<string, unknown>;
  is_undone: boolean;
  created_at: string;
}

type SupabaseLike = {
  from: (table: string) => any;
};

function missingLedgerActionsTable(error: unknown): boolean {
  const code = String((error as { code?: string })?.code ?? "");
  const message = String((error as { message?: string })?.message ?? "").toLowerCase();
  return (
    code === "42P01" ||
    code === "PGRST205" ||
    message.includes(LEDGER_ACTIONS_TABLE)
  );
}

function normalizeRows(value: unknown): InventorySnapshot[] {
  return Array.isArray(value) ? (value as InventorySnapshot[]) : [];
}

function normalizeIds(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((id): id is string => typeof id === "string" && id.length > 0);
  }
  return typeof value === "string" && value.length > 0 ? [value] : [];
}

function sanitizeInventoryUpdate(row: InventorySnapshot): Record<string, unknown> {
  const payload = { ...row };
  delete payload.id;
  delete payload.created_at;
  delete payload.updated_at;
  return payload;
}

async function throwIfError(result: PromiseLike<{ error?: unknown }> | { error?: unknown }) {
  const resolved = await result;
  if (resolved?.error) throw resolved.error;
}

export async function getInventorySnapshots(
  supabase: SupabaseLike,
  userId: string,
  itemIds: string[]
): Promise<InventorySnapshot[]> {
  const ids = Array.from(new Set(itemIds.filter(Boolean)));
  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from(BUSINESS_TABLE)
    .select("*")
    .in("id", ids)
    .eq("user_id", userId)
    .eq("item_kind", "inventory");

  if (error) throw error;
  return (data ?? []) as InventorySnapshot[];
}

export async function getCardImageSnapshots(
  supabase: SupabaseLike,
  userId: string,
  itemIds: string[]
): Promise<InventorySnapshot[]> {
  const ids = Array.from(new Set(itemIds.filter(Boolean)));
  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from("card_images")
    .select("*")
    .in("card_id", ids)
    .eq("user_id", userId);

  if (error) throw error;
  return (data ?? []) as InventorySnapshot[];
}

export async function recordLedgerAction(args: {
  supabase: SupabaseLike;
  userId: string;
  businessAccountId: string;
  actionType: BusinessLedgerActionType;
  label: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  const { supabase, userId, businessAccountId, actionType, label, payload } = args;

  const { error } = await supabase.from(LEDGER_ACTIONS_TABLE).insert({
    user_id: userId,
    business_account_id: businessAccountId,
    action_type: actionType,
    label,
    payload,
  });

  if (error) {
    if (!missingLedgerActionsTable(error)) {
      console.warn("[ledger-actions] failed to record undo action", error);
    }
  }
}

export async function getLatestLedgerAction(args: {
  supabase: SupabaseLike;
  userId: string;
  businessAccountId: string;
}): Promise<{ action: BusinessLedgerAction | null; needsMigration: boolean }> {
  const { supabase, userId, businessAccountId } = args;

  const { data, error } = await supabase
    .from(LEDGER_ACTIONS_TABLE)
    .select("id, user_id, business_account_id, action_type, label, payload, is_undone, created_at")
    .eq("user_id", userId)
    .eq("business_account_id", businessAccountId)
    .eq("is_undone", false)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (missingLedgerActionsTable(error)) {
      return { action: null, needsMigration: true };
    }
    throw error;
  }

  return {
    action: (data as BusinessLedgerAction | null) ?? null,
    needsMigration: false,
  };
}

async function restoreInventoryRows(
  supabase: SupabaseLike,
  rows: InventorySnapshot[]
): Promise<void> {
  for (const row of rows) {
    if (typeof row.id !== "string") continue;
    await throwIfError(
      supabase
        .from(BUSINESS_TABLE)
        .update({
          ...sanitizeInventoryUpdate(row),
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id)
        .eq("item_kind", "inventory")
    );
  }
}

async function reinsertInventoryRows(
  supabase: SupabaseLike,
  rows: InventorySnapshot[]
): Promise<void> {
  if (rows.length === 0) return;
  await throwIfError(
    supabase
      .from(BUSINESS_TABLE)
      .upsert(rows, { onConflict: "id" })
  );
}

async function reinsertCardImageRows(
  supabase: SupabaseLike,
  rows: InventorySnapshot[]
): Promise<void> {
  if (rows.length === 0) return;
  await throwIfError(
    supabase
      .from("card_images")
      .upsert(rows, { onConflict: "id" })
  );
}

async function deleteInventoryRows(
  supabase: SupabaseLike,
  userId: string,
  itemIds: string[]
): Promise<void> {
  const ids = Array.from(new Set(itemIds.filter(Boolean)));
  if (ids.length === 0) return;

  await throwIfError(
    supabase
      .from(BUSINESS_TABLE)
      .delete()
      .in("id", ids)
      .eq("user_id", userId)
      .eq("item_kind", "inventory")
  );
}

async function undoSaleCreate(
  supabase: SupabaseLike,
  businessAccountId: string,
  payload: Record<string, unknown>
): Promise<void> {
  const saleId = typeof payload.saleId === "string" ? payload.saleId : null;
  if (saleId) {
    await throwIfError(
      supabase
        .from("business_sales")
        .update({ is_deleted: true, updated_at: new Date().toISOString() })
        .eq("id", saleId)
        .eq("business_account_id", businessAccountId)
    );
    // Unwind the cash this sale put on hand.
    await reverseCashBySource({
      supabase,
      businessAccountId,
      sourceType: "sale",
      sourceId: saleId,
    });
  }

  await restoreInventoryRows(
    supabase,
    normalizeRows(payload.inventoryBeforeRows)
  );
}

async function undoTradeCreate(
  supabase: SupabaseLike,
  businessAccountId: string,
  payload: Record<string, unknown>
): Promise<void> {
  const incomingItemIds = normalizeIds(payload.incomingItemIds);
  if (incomingItemIds.length > 0) {
    await throwIfError(
      supabase
        .from(BUSINESS_TABLE)
        .delete()
        .in("id", incomingItemIds)
        .eq("item_kind", "inventory")
    );
  }

  await restoreInventoryRows(
    supabase,
    normalizeRows(payload.outgoingBeforeRows)
  );

  const tradeId = typeof payload.tradeId === "string" ? payload.tradeId : null;
  if (tradeId) {
    await throwIfError(
      supabase
        .from("business_trades")
        .update({ is_deleted: true, updated_at: new Date().toISOString() })
        .eq("id", tradeId)
        .eq("business_account_id", businessAccountId)
    );
    // Unwind the net cash this trade moved.
    await reverseCashBySource({
      supabase,
      businessAccountId,
      sourceType: "trade",
      sourceId: tradeId,
    });
  }
}

export async function undoLedgerAction(args: {
  supabase: SupabaseLike;
  userId: string;
  context: BusinessContext;
  action: BusinessLedgerAction;
}): Promise<void> {
  const { supabase, userId, context, action } = args;
  const payload = action.payload ?? {};

  switch (action.action_type) {
    case "inventory_create":
    case "inventory_bulk_create":
      await deleteInventoryRows(
        supabase,
        userId,
        normalizeIds(payload.itemIds ?? payload.itemId)
      );
      break;

    case "inventory_update":
    case "inventory_bulk_update":
      await restoreInventoryRows(supabase, normalizeRows(payload.beforeRows));
      break;

    case "inventory_delete":
      await reinsertInventoryRows(supabase, normalizeRows(payload.beforeRows));
      await reinsertCardImageRows(supabase, normalizeRows(payload.cardImageRows));
      break;

    case "sale_create":
      await undoSaleCreate(supabase, context.businessAccountId, payload);
      break;

    case "trade_create":
      await undoTradeCreate(supabase, context.businessAccountId, payload);
      break;
  }

  await throwIfError(
    supabase
      .from(LEDGER_ACTIONS_TABLE)
      .update({ is_undone: true, undone_at: new Date().toISOString() })
      .eq("id", action.id)
      .eq("business_account_id", context.businessAccountId)
  );
}
