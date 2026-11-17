import { createClient } from "@/lib/supabase/server";
import { createSale, deleteSale, requireBusinessAccess } from "@/lib/business/actions";
import {
  allocateConsignmentPayout,
  type ConsignmentSplitMethod,
} from "@/lib/business/consignment-allocation";

/**
 * Consignment orders — cards sent to a consignor (usually the ones that didn't
 * meet grading criteria). Inventory cards go to status pending_sale while out;
 * on settlement each one is recorded as a sale at its allocated share of the
 * payout (so P&L, cash on hand and the ledger all pick it up). Cards added by
 * hand never existed in inventory, so their combined profit/loss is booked as
 * one misc-profit entry instead.
 */

const INVENTORY_TABLE = "collection_items";
const CLOSED_STATUSES = new Set(["sold", "traded"]);

export interface ConsignmentItem {
  id: string;
  order_id: string;
  inventory_item_id: string | null;
  title: string;
  card_number: string | null;
  quantity: number;
  cost_cents: number;
  prior_status: string | null;
  payout_cents: number | null;
  sale_id: string | null;
  position: number;
}

export interface ConsignmentOrder {
  id: string;
  consignor: string;
  reference: string | null;
  sent_date: string;
  status: "open" | "settled";
  split_method: ConsignmentSplitMethod;
  payout_total_cents: number | null;
  settled_date: string | null;
  misc_profit_id: string | null;
  notes: string | null;
  created_at: string;
  items: ConsignmentItem[];
}

export interface ManualItemInput {
  title: string;
  card_number?: string | null;
  cost_cents: number;
}

export class ConsignmentError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function context(userId: string) {
  const supabase = await createClient();
  const ctx = await requireBusinessAccess(userId);
  return { supabase, accountId: ctx.businessAccountId };
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function listConsignmentOrders(userId: string): Promise<ConsignmentOrder[]> {
  const { supabase, accountId } = await context(userId);
  const { data, error } = await supabase
    .from("consignment_orders")
    .select("*, items:consignment_order_items(*)")
    .eq("business_account_id", accountId)
    .order("sent_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as ConsignmentOrder[]).map((order) => ({
    ...order,
    items: [...(order.items ?? [])].sort((a, b) => a.position - b.position),
  }));
}

async function getOrder(supabase: Supabase, accountId: string, orderId: string) {
  const { data, error } = await supabase
    .from("consignment_orders")
    .select("*, items:consignment_order_items(*)")
    .eq("id", orderId)
    .eq("business_account_id", accountId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new ConsignmentError("Consignment order not found", 404);
  const order = data as ConsignmentOrder;
  order.items = [...(order.items ?? [])].sort((a, b) => a.position - b.position);
  return order;
}

/** Inventory ids already sitting in some open consignment order. */
async function inventoryIdsInOpenOrders(supabase: Supabase, accountId: string) {
  const { data, error } = await supabase
    .from("consignment_order_items")
    .select("inventory_item_id, order:consignment_orders!inner(status)")
    .eq("business_account_id", accountId)
    .eq("order.status", "open")
    .not("inventory_item_id", "is", null);
  if (error) throw error;
  return new Set(
    ((data ?? []) as { inventory_item_id: string }[]).map((r) => r.inventory_item_id)
  );
}

async function addItems(args: {
  supabase: Supabase;
  accountId: string;
  orderId: string;
  inventoryIds: string[];
  manual: ManualItemInput[];
  startPosition: number;
}) {
  const { supabase, accountId, orderId, manual, startPosition } = args;
  const inventoryIds = [...new Set(args.inventoryIds)];
  const rows: Record<string, unknown>[] = [];
  let position = startPosition;

  if (inventoryIds.length > 0) {
    const taken = await inventoryIdsInOpenOrders(supabase, accountId);
    const { data, error } = await supabase
      .from(INVENTORY_TABLE)
      .select("id, title, card_number, quantity, cost_basis_total_cents, status")
      .eq("business_account_id", accountId)
      .eq("item_kind", "inventory")
      .in("id", inventoryIds);
    if (error) throw error;
    const byId = new Map((data ?? []).map((r: any) => [r.id as string, r]));
    for (const id of inventoryIds) {
      const inv = byId.get(id);
      if (!inv) throw new ConsignmentError("A selected card is no longer in inventory");
      if (CLOSED_STATUSES.has(inv.status)) {
        throw new ConsignmentError(`"${inv.title}" is already ${inv.status}`);
      }
      if (taken.has(id)) {
        throw new ConsignmentError(`"${inv.title}" is already in an open consignment order`);
      }
      rows.push({
        order_id: orderId,
        business_account_id: accountId,
        inventory_item_id: id,
        title: inv.title || "Untitled card",
        card_number: inv.card_number ?? null,
        quantity: Math.max(1, Number(inv.quantity) || 1),
        cost_cents: Math.round(Number(inv.cost_basis_total_cents) || 0),
        prior_status: inv.status,
        position: position++,
      });
    }
  }

  for (const m of manual) {
    const title = m.title?.trim();
    if (!title) continue;
    rows.push({
      order_id: orderId,
      business_account_id: accountId,
      inventory_item_id: null,
      title,
      card_number: m.card_number?.trim() || null,
      quantity: 1,
      cost_cents: Math.max(0, Math.round(Number(m.cost_cents) || 0)),
      prior_status: null,
      position: position++,
    });
  }

  if (rows.length === 0) return;
  const { error } = await supabase.from("consignment_order_items").insert(rows);
  if (error) throw error;

  if (inventoryIds.length > 0) {
    const { error: statusError } = await supabase
      .from(INVENTORY_TABLE)
      .update({ status: "pending_sale" })
      .eq("business_account_id", accountId)
      .in("id", inventoryIds);
    if (statusError) throw statusError;
  }
}

/** Put removed inventory cards back to the status they had before consignment. */
async function restoreInventory(supabase: Supabase, accountId: string, items: ConsignmentItem[]) {
  for (const item of items) {
    if (!item.inventory_item_id) continue;
    await supabase
      .from(INVENTORY_TABLE)
      .update({ status: item.prior_status && !CLOSED_STATUSES.has(item.prior_status) ? item.prior_status : "unlisted" })
      .eq("id", item.inventory_item_id)
      .eq("business_account_id", accountId)
      .eq("status", "pending_sale");
  }
}

export async function createConsignmentOrder(
  userId: string,
  input: {
    consignor: string;
    reference?: string | null;
    sent_date?: string | null;
    notes?: string | null;
    inventory_item_ids?: string[];
    manual_items?: ManualItemInput[];
  }
): Promise<ConsignmentOrder> {
  const { supabase, accountId } = await context(userId);
  const consignor = input.consignor?.trim();
  if (!consignor) throw new ConsignmentError("Consignor is required");
  const inventoryIds = input.inventory_item_ids ?? [];
  const manual = (input.manual_items ?? []).filter((m) => m.title?.trim());
  if (inventoryIds.length + manual.length === 0) {
    throw new ConsignmentError("Add at least one card");
  }

  const { data, error } = await supabase
    .from("consignment_orders")
    .insert({
      user_id: userId,
      business_account_id: accountId,
      consignor,
      reference: input.reference?.trim() || null,
      sent_date: input.sent_date || today(),
      notes: input.notes?.trim() || null,
    })
    .select("id")
    .single();
  if (error) throw error;

  try {
    await addItems({ supabase, accountId, orderId: data.id, inventoryIds, manual, startPosition: 0 });
  } catch (err) {
    await supabase.from("consignment_orders").delete().eq("id", data.id);
    throw err;
  }
  return getOrder(supabase, accountId, data.id);
}

export async function updateConsignmentOrder(
  userId: string,
  orderId: string,
  input: {
    consignor?: string;
    reference?: string | null;
    sent_date?: string | null;
    notes?: string | null;
    add_inventory_item_ids?: string[];
    add_manual_items?: ManualItemInput[];
    remove_item_ids?: string[];
    item_costs?: { id: string; cost_cents: number }[];
  }
): Promise<ConsignmentOrder> {
  const { supabase, accountId } = await context(userId);
  const order = await getOrder(supabase, accountId, orderId);
  const touchesItems =
    (input.add_inventory_item_ids?.length ?? 0) +
      (input.add_manual_items?.length ?? 0) +
      (input.remove_item_ids?.length ?? 0) +
      (input.item_costs?.length ?? 0) >
    0;
  if (touchesItems && order.status !== "open") {
    throw new ConsignmentError("Reopen the order before changing its cards");
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.consignor !== undefined) {
    if (!input.consignor.trim()) throw new ConsignmentError("Consignor is required");
    patch.consignor = input.consignor.trim();
  }
  if (input.reference !== undefined) patch.reference = input.reference?.trim() || null;
  if (input.sent_date) patch.sent_date = input.sent_date;
  if (input.notes !== undefined) patch.notes = input.notes?.trim() || null;
  const { error } = await supabase.from("consignment_orders").update(patch).eq("id", orderId);
  if (error) throw error;

  if (input.remove_item_ids?.length) {
    const removing = order.items.filter((i) => input.remove_item_ids!.includes(i.id));
    await supabase
      .from("consignment_order_items")
      .delete()
      .eq("order_id", orderId)
      .in("id", removing.map((i) => i.id));
    await restoreInventory(supabase, accountId, removing);
  }

  for (const c of input.item_costs ?? []) {
    const item = order.items.find((i) => i.id === c.id);
    if (!item || item.inventory_item_id) continue; // inventory costs come from the ledger
    await supabase
      .from("consignment_order_items")
      .update({ cost_cents: Math.max(0, Math.round(c.cost_cents)) })
      .eq("id", c.id);
  }

  if (input.add_inventory_item_ids?.length || input.add_manual_items?.length) {
    const nextPosition = order.items.reduce((max, i) => Math.max(max, i.position + 1), 0);
    await addItems({
      supabase,
      accountId,
      orderId,
      inventoryIds: input.add_inventory_item_ids ?? [],
      manual: input.add_manual_items ?? [],
      startPosition: nextPosition,
    });
  }

  return getOrder(supabase, accountId, orderId);
}

export async function deleteConsignmentOrder(userId: string, orderId: string): Promise<void> {
  const { supabase, accountId } = await context(userId);
  const order = await getOrder(supabase, accountId, orderId);
  if (order.status !== "open") {
    throw new ConsignmentError("Reopen the order before deleting it");
  }
  await restoreInventory(supabase, accountId, order.items);
  const { error } = await supabase.from("consignment_orders").delete().eq("id", orderId);
  if (error) throw error;
}

function saleNote(order: ConsignmentOrder): string {
  return `Consignment · ${order.consignor}${order.reference ? ` #${order.reference}` : ""}`;
}

export async function settleConsignmentOrder(
  userId: string,
  orderId: string,
  input: { payout_total_cents: number; settled_date?: string | null; split_method: ConsignmentSplitMethod }
): Promise<ConsignmentOrder> {
  const { supabase, accountId } = await context(userId);
  const order = await getOrder(supabase, accountId, orderId);
  if (order.status !== "open") throw new ConsignmentError("Order is already settled");
  if (order.items.length === 0) throw new ConsignmentError("Order has no cards");
  const payoutTotal = Math.round(Number(input.payout_total_cents));
  if (!Number.isFinite(payoutTotal) || payoutTotal < 0) {
    throw new ConsignmentError("Enter the net payout you received");
  }
  const settledDate = input.settled_date || today();

  // Refresh inventory costs so the split uses what the ledger says today.
  const linkedIds = order.items.map((i) => i.inventory_item_id).filter(Boolean) as string[];
  if (linkedIds.length > 0) {
    const { data, error } = await supabase
      .from(INVENTORY_TABLE)
      .select("id, cost_basis_total_cents, status, title")
      .eq("business_account_id", accountId)
      .in("id", linkedIds);
    if (error) throw error;
    const byId = new Map((data ?? []).map((r: any) => [r.id as string, r]));
    for (const item of order.items) {
      if (!item.inventory_item_id) continue;
      const inv = byId.get(item.inventory_item_id);
      if (!inv) continue; // deleted from inventory — keep the snapshot, book as hand-added
      if (CLOSED_STATUSES.has(inv.status)) {
        throw new ConsignmentError(`"${inv.title}" was already marked ${inv.status} — remove it from the order first`);
      }
      item.cost_cents = Math.round(Number(inv.cost_basis_total_cents) || 0);
    }
  }

  const payouts = allocateConsignmentPayout(
    order.items.map((i) => i.cost_cents),
    payoutTotal,
    input.split_method
  );

  const createdSales: string[] = [];
  let miscProfitId: string | null = null;
  try {
    let manualProfit = 0;
    let manualCount = 0;
    for (let idx = 0; idx < order.items.length; idx += 1) {
      const item = order.items[idx];
      const payout = payouts[idx];
      let saleId: string | null = null;
      if (item.inventory_item_id) {
        try {
          const sale = await createSale(userId, {
            inventory_item_id: item.inventory_item_id,
            channel: "other",
            sold_at: settledDate,
            sold_price_cents: payout,
            net_payout_cents: payout,
            cogs_cents: item.cost_cents,
            notes: saleNote(order),
          } as any);
          saleId = sale.id;
          createdSales.push(sale.id);
        } catch (err: any) {
          if (!/not found/i.test(err?.message ?? "")) throw err;
          // Inventory row was deleted — fall back to booking it like a hand-added card.
        }
      }
      if (!saleId) {
        manualProfit += payout - item.cost_cents;
        manualCount += 1;
      }
      const { error } = await supabase
        .from("consignment_order_items")
        .update({ payout_cents: payout, sale_id: saleId, cost_cents: item.cost_cents })
        .eq("id", item.id);
      if (error) throw error;
    }

    if (manualCount > 0 && manualProfit !== 0) {
      const { data, error } = await supabase
        .from("business_misc_profit")
        .insert({
          user_id: userId,
          business_account_id: accountId,
          occurred_at: settledDate,
          amount_cents: manualProfit,
          label: `${saleNote(order)} (${manualCount} hand-added card${manualCount === 1 ? "" : "s"})`,
        })
        .select("id")
        .single();
      if (error) throw error;
      miscProfitId = data.id;
    }

    const { error } = await supabase
      .from("consignment_orders")
      .update({
        status: "settled",
        split_method: input.split_method,
        payout_total_cents: payoutTotal,
        settled_date: settledDate,
        misc_profit_id: miscProfitId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderId);
    if (error) throw error;
  } catch (err) {
    // Roll back anything booked so a failed settle leaves the order open and clean.
    for (const saleId of createdSales) {
      await deleteSale(userId, saleId).catch(() => undefined);
    }
    if (miscProfitId) await supabase.from("business_misc_profit").delete().eq("id", miscProfitId);
    await supabase
      .from("consignment_order_items")
      .update({ payout_cents: null, sale_id: null })
      .eq("order_id", orderId);
    if (linkedIds.length > 0) {
      await supabase
        .from(INVENTORY_TABLE)
        .update({ status: "pending_sale" })
        .eq("business_account_id", accountId)
        .in("id", linkedIds)
        .eq("status", "sold");
    }
    throw err;
  }

  return getOrder(supabase, accountId, orderId);
}

/** Undo a settlement: delete the sales + misc-profit entry, cards back to pending. */
export async function reopenConsignmentOrder(userId: string, orderId: string): Promise<ConsignmentOrder> {
  const { supabase, accountId } = await context(userId);
  const order = await getOrder(supabase, accountId, orderId);
  if (order.status !== "settled") throw new ConsignmentError("Order is not settled");

  for (const item of order.items) {
    if (item.sale_id) await deleteSale(userId, item.sale_id);
    if (item.inventory_item_id && item.sale_id) {
      await supabase
        .from(INVENTORY_TABLE)
        .update({ status: "pending_sale" })
        .eq("id", item.inventory_item_id)
        .eq("business_account_id", accountId);
    }
  }
  if (order.misc_profit_id) {
    await supabase
      .from("business_misc_profit")
      .delete()
      .eq("id", order.misc_profit_id)
      .eq("business_account_id", accountId);
  }
  await supabase
    .from("consignment_order_items")
    .update({ payout_cents: null, sale_id: null })
    .eq("order_id", orderId);
  const { error } = await supabase
    .from("consignment_orders")
    .update({
      status: "open",
      payout_total_cents: null,
      settled_date: null,
      misc_profit_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", orderId);
  if (error) throw error;
  return getOrder(supabase, accountId, orderId);
}
