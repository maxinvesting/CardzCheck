import { createClient } from "@/lib/supabase/server";
import {
  createInventoryItem,
  createSale,
  deleteInventoryItems,
  deleteSale,
  requireBusinessAccess,
} from "@/lib/business/actions";
import { computeConsignmentLines } from "@/lib/business/consignment-allocation";

/**
 * Consignment orders — entered once the consignor has sold everything. Each
 * card has what you paid and what it sold for; the order's consignor fees are
 * split evenly across the cards. Saving books every card as a sale on the
 * 'consignment' channel, so it lands in Sales & Trades, Financials and cash on
 * hand like any other sale. Cards typed in by hand get an inventory row first
 * (so the sale has a card attached); deleting the order removes those rows and
 * puts picked inventory cards back to their old status.
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
  sold_price_cents: number | null;
  fee_cents: number;
  payout_cents: number | null;
  prior_status: string | null;
  sale_id: string | null;
  created_inventory: boolean;
  position: number;
}

export interface ConsignmentOrder {
  id: string;
  consignor: string;
  reference: string | null;
  sent_date: string;
  settled_date: string | null;
  fees_total_cents: number;
  payout_total_cents: number | null;
  notes: string | null;
  created_at: string;
  items: ConsignmentItem[];
}

export interface ConsignmentCardInput {
  /** Picked from inventory. Omit for a card typed in by hand. */
  inventory_item_id?: string | null;
  title?: string | null;
  card_number?: string | null;
  cost_cents: number;
  sold_price_cents: number;
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

function sortItems(order: ConsignmentOrder): ConsignmentOrder {
  return { ...order, items: [...(order.items ?? [])].sort((a, b) => a.position - b.position) };
}

export async function listConsignmentOrders(userId: string): Promise<ConsignmentOrder[]> {
  const { supabase, accountId } = await context(userId);
  const { data, error } = await supabase
    .from("consignment_orders")
    .select("*, items:consignment_order_items(*)")
    .eq("business_account_id", accountId)
    .order("settled_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as ConsignmentOrder[]).map(sortItems);
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
  return sortItems(data as ConsignmentOrder);
}

function saleNote(consignor: string, reference: string | null): string {
  return `Consignment · ${consignor}${reference ? ` #${reference}` : ""}`;
}

/** Undo everything an order booked: sales, created inventory rows, statuses. */
async function unbookItems(userId: string, supabase: Supabase, accountId: string, items: ConsignmentItem[]) {
  const createdIds: string[] = [];
  for (const item of items) {
    if (item.sale_id) await deleteSale(userId, item.sale_id).catch(() => undefined);
    if (!item.inventory_item_id) continue;
    if (item.created_inventory) {
      createdIds.push(item.inventory_item_id);
    } else {
      const prior =
        item.prior_status && !CLOSED_STATUSES.has(item.prior_status) ? item.prior_status : "unlisted";
      await supabase
        .from(INVENTORY_TABLE)
        .update({ status: prior })
        .eq("id", item.inventory_item_id)
        .eq("business_account_id", accountId);
    }
  }
  if (createdIds.length > 0) await deleteInventoryItems(userId, createdIds).catch(() => undefined);
}

export async function createConsignmentOrder(
  userId: string,
  input: {
    consignor: string;
    reference?: string | null;
    sent_date?: string | null;
    sold_date?: string | null;
    notes?: string | null;
    fees_total_cents?: number | null;
    cards: ConsignmentCardInput[];
  }
): Promise<ConsignmentOrder> {
  const { supabase, accountId } = await context(userId);
  const consignor = input.consignor?.trim();
  if (!consignor) throw new ConsignmentError("Consignor is required");
  const cards = input.cards.filter((c) => c.inventory_item_id || c.title?.trim());
  if (cards.length === 0) throw new ConsignmentError("Add at least one card");
  const soldDate = input.sold_date || today();
  const reference = input.reference?.trim() || null;
  const feesTotal = Math.max(0, Math.round(Number(input.fees_total_cents) || 0));

  // Validate picked inventory cards up front.
  const inventoryIds = cards.map((c) => c.inventory_item_id).filter(Boolean) as string[];
  if (new Set(inventoryIds).size !== inventoryIds.length) {
    throw new ConsignmentError("The same inventory card is in the order twice");
  }
  const inventoryById = new Map<string, any>();
  if (inventoryIds.length > 0) {
    const { data, error } = await supabase
      .from(INVENTORY_TABLE)
      .select("id, title, card_number, quantity, status")
      .eq("business_account_id", accountId)
      .eq("item_kind", "inventory")
      .in("id", inventoryIds);
    if (error) throw error;
    for (const row of data ?? []) inventoryById.set(row.id, row);
    for (const id of inventoryIds) {
      const inv = inventoryById.get(id);
      if (!inv) throw new ConsignmentError("A selected card is no longer in inventory");
      if (CLOSED_STATUSES.has(inv.status)) {
        throw new ConsignmentError(`"${inv.title}" is already ${inv.status}`);
      }
    }
  }

  const lines = computeConsignmentLines(
    cards.map((c) => ({
      costCents: Math.max(0, Math.round(Number(c.cost_cents) || 0)),
      soldCents: Math.max(0, Math.round(Number(c.sold_price_cents) || 0)),
    })),
    feesTotal
  );

  const { data: orderRow, error: orderError } = await supabase
    .from("consignment_orders")
    .insert({
      user_id: userId,
      business_account_id: accountId,
      consignor,
      reference,
      sent_date: input.sent_date || soldDate,
      status: "settled",
      settled_date: soldDate,
      fees_total_cents: feesTotal,
      payout_total_cents: lines.reduce((s, l) => s + l.netCents, 0),
      notes: input.notes?.trim() || null,
    })
    .select("id")
    .single();
  if (orderError) throw orderError;

  const booked: ConsignmentItem[] = [];
  try {
    for (let i = 0; i < cards.length; i += 1) {
      const card = cards[i];
      const line = lines[i];
      const item: ConsignmentItem = {
        id: "",
        order_id: orderRow.id,
        inventory_item_id: card.inventory_item_id ?? null,
        title: "",
        card_number: null,
        quantity: 1,
        cost_cents: line.costCents,
        sold_price_cents: line.soldCents,
        fee_cents: line.feeCents,
        payout_cents: line.netCents,
        prior_status: null,
        sale_id: null,
        created_inventory: false,
        position: i,
      };

      if (card.inventory_item_id) {
        const inv = inventoryById.get(card.inventory_item_id);
        item.title = inv.title || "Untitled card";
        item.card_number = inv.card_number ?? null;
        item.quantity = Math.max(1, Number(inv.quantity) || 1);
        item.prior_status = inv.status;
      } else {
        item.title = card.title!.trim();
        item.card_number = card.card_number?.trim() || null;
        const created = await createInventoryItem(userId, {
          title: item.title,
          card_number: item.card_number,
          quantity: 1,
          acquisition_type: "buy",
          acquisition_date: soldDate,
          cost_basis_total_cents: line.costCents,
          condition_status: "raw",
          status: "unlisted",
          notes: saleNote(consignor, reference),
        } as any);
        item.inventory_item_id = created.id;
        item.created_inventory = true;
      }
      booked.push(item);

      const sale = await createSale(userId, {
        inventory_item_id: item.inventory_item_id,
        channel: "consignment",
        sold_at: soldDate,
        sold_price_cents: line.soldCents,
        platform_fees_cents: line.feeCents,
        cogs_cents: line.costCents,
        notes: saleNote(consignor, reference),
      } as any);
      item.sale_id = sale.id;
    }

    const { error } = await supabase.from("consignment_order_items").insert(
      booked.map(({ id: _id, ...rest }) => ({ ...rest, business_account_id: accountId }))
    );
    if (error) throw error;
  } catch (err) {
    await unbookItems(userId, supabase, accountId, booked);
    await supabase.from("consignment_orders").delete().eq("id", orderRow.id);
    throw err;
  }

  return getOrder(supabase, accountId, orderRow.id);
}

/** Delete an order and everything it booked. */
export async function deleteConsignmentOrder(userId: string, orderId: string): Promise<void> {
  const { supabase, accountId } = await context(userId);
  let order: ConsignmentOrder;
  try {
    order = await getOrder(supabase, accountId, orderId);
  } catch (err) {
    // Already gone (e.g. deleted in another tab) — nothing left to undo.
    if (err instanceof ConsignmentError && err.status === 404) return;
    throw err;
  }
  await unbookItems(userId, supabase, accountId, order.items);
  const { error } = await supabase.from("consignment_orders").delete().eq("id", orderId);
  if (error) throw error;
}
