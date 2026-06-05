/**
 * POST /api/marketplace/orders/[id]/label
 *
 * Buys a shipping label for a paid order. Authorised for:
 *   - the seller, when the order is seller-fulfilled
 *   - an admin, when the order is platform-fulfilled (ships from the vault)
 *
 * Idempotent: if a label already exists it's returned as-is. Uses Shippo when
 * SHIPPO_API_KEY is set, otherwise a deterministic mock label.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getAdminAuth } from "@/lib/admin";
import { getPayoutAccount } from "@/lib/marketplace/connect";
import {
  purchaseShippingLabel,
  type ShippingAddress,
} from "@/lib/marketplace/shipping";

export const runtime = "nodejs";

function platformShipFrom(): ShippingAddress {
  return {
    name: process.env.PLATFORM_SHIP_FROM_NAME || "CardzCheck Vault",
    phone: process.env.PLATFORM_SHIP_FROM_PHONE || "5555555555",
    street1: process.env.PLATFORM_SHIP_FROM_STREET1 || "1 Market St",
    street2: process.env.PLATFORM_SHIP_FROM_STREET2 || null,
    city: process.env.PLATFORM_SHIP_FROM_CITY || "San Francisco",
    state: process.env.PLATFORM_SHIP_FROM_STATE || "CA",
    zip: process.env.PLATFORM_SHIP_FROM_ZIP || "94105",
    country: process.env.PLATFORM_SHIP_FROM_COUNTRY || "US",
  };
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const service = await createServiceClient();
  const { data: tx, error } = await service
    .from("transactions")
    .select(
      `id, seller_id, buyer_id, fulfilled_by, fulfillment_status, ship_to,
       tracking_number, tracking_url, label_url, carrier, service_level,
       label_cost_cents, shipment_id, rate_id, shipping_provider,
       listings!inner(marketplace_cards!inner(title, player, year))`
    )
    .eq("id", id)
    .single<{
      id: string;
      seller_id: string;
      buyer_id: string;
      fulfilled_by: "seller" | "platform";
      fulfillment_status: string;
      ship_to: ShippingAddress | null;
      tracking_number: string | null;
      tracking_url: string | null;
      label_url: string | null;
      carrier: string | null;
      service_level: string | null;
      shipping_provider: string | null;
      listings: { marketplace_cards: { title: string; player: string; year: number } };
    }>();

  if (error || !tx) {
    return NextResponse.json({ error: "order_not_found" }, { status: 404 });
  }

  const platformFulfills = tx.fulfilled_by === "platform";
  const isSeller = tx.seller_id === user.id;
  const { user: adminUser } = await getAdminAuth();
  const isAdmin = !!adminUser;
  const authorized = platformFulfills ? isAdmin : isSeller || isAdmin;
  if (!authorized) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Already have a label → return it (idempotent).
  if (tx.label_url && tx.tracking_number) {
    return NextResponse.json({
      label: {
        provider: tx.shipping_provider,
        carrier: tx.carrier,
        serviceLevel: tx.service_level,
        trackingNumber: tx.tracking_number,
        trackingUrl: tx.tracking_url,
        labelUrl: tx.label_url,
      },
      idempotent: true,
    });
  }

  if (!["paid", "label_created"].includes(tx.fulfillment_status)) {
    return NextResponse.json(
      { error: "invalid_status", status: tx.fulfillment_status },
      { status: 409 }
    );
  }

  if (!tx.ship_to?.street1) {
    return NextResponse.json({ error: "no_shipping_address" }, { status: 422 });
  }

  // Resolve the ship-from address.
  let shipFrom: ShippingAddress;
  if (platformFulfills) {
    shipFrom = platformShipFrom();
  } else {
    const acct = await getPayoutAccount(tx.seller_id);
    if (!acct?.ship_from?.street1) {
      return NextResponse.json({ error: "no_ship_from_address" }, { status: 422 });
    }
    shipFrom = acct.ship_from as ShippingAddress;
  }

  const card = tx.listings.marketplace_cards;

  let label;
  try {
    label = await purchaseShippingLabel({
      from: shipFrom,
      to: tx.ship_to,
      reference: `${card.year} ${card.player} (${tx.id.slice(0, 8)})`,
    });
  } catch (err) {
    console.error("[orders/label] purchase failed", err);
    return NextResponse.json(
      { error: "label_purchase_failed", message: err instanceof Error ? err.message : "unknown" },
      { status: 502 }
    );
  }

  const { error: updateErr } = await service
    .from("transactions")
    .update({
      fulfillment_status: "label_created",
      ship_from: shipFrom,
      shipping_provider: label.provider,
      shipment_id: label.shipmentId,
      rate_id: label.rateId,
      carrier: label.carrier,
      service_level: label.serviceLevel,
      tracking_number: label.trackingNumber,
      tracking_url: label.trackingUrl,
      label_url: label.labelUrl,
      label_cost_cents: label.costCents,
    })
    .eq("id", tx.id);

  if (updateErr) {
    console.error("[orders/label] update failed", updateErr);
    return NextResponse.json(
      { error: "order_update_failed", message: updateErr.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ label });
}
