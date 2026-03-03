import { NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * Sync shop_listings from business_inventory_items.
 * Best-effort mapping - business_inventory_items has title, not player_name/year/set_brand.
 * TODO: Parse title for year/set if possible; schema mismatch between inventory and shop.
 */
export async function POST() {
  const admin = await getAdminAuth();
  if (!admin.user) {
    return admin.unauthorizedResponse!;
  }

  const supabase = await createServiceClient();

  const { data: inventoryItems, error: invError } = await supabase
    .from("business_inventory_items")
    .select(
      "id,title,quantity,grade,cert_number,list_price_cents,current_market_value_cents,cost_basis_total_cents,status,condition_status,channel"
    )
    .eq("status", "listed")
    .in("condition_status", ["graded", "raw"]);

  if (invError) {
    console.error("Sync: failed to fetch inventory", invError);
    return NextResponse.json(
      { error: "Failed to fetch inventory" },
      { status: 500 }
    );
  }

  const items = inventoryItems ?? [];
  const results = { created: 0, updated: 0, skipped: 0, flagged: [] as string[] };

  for (const inv of items) {
    const title = String(inv.title ?? "").trim();
    const grade = inv.grade ?? "";
    const condition = inv.condition_status === "raw" ? "raw" : "graded";
    const normalizedGrade = grade || (condition === "raw" ? "Raw" : "Graded");

    if (!title) {
      results.skipped++;
      continue;
    }

    // TODO: Parse title for year, set_brand, parallel_variant - business schema lacks these
    const playerName = title;
    const year = parseInt(title.match(/\b(19|20)\d{2}\b/)?.[0] ?? "0", 10) || 2020;
    const setBrand = title;

    const listPriceCents = inv.list_price_cents ?? 0;
    const costCents = inv.cost_basis_total_cents ?? 0;
    const price =
      listPriceCents > 0
        ? listPriceCents / 100
        : costCents > 0
        ? (costCents / 100) * 1.3
        : 0;
    const cmv =
      inv.current_market_value_cents != null
        ? inv.current_market_value_cents / 100
        : null;

    const qty = Math.max(0, inv.quantity ?? 1);

    const { data: existing } = await supabase
      .from("shop_listings")
      .select("id,quantity,cmv")
      .eq("player_name", playerName)
      .eq("year", year)
      .eq("set_brand", setBrand)
      .eq("grade", normalizedGrade)
      .maybeSingle();

    if (existing) {
      const { error: updErr } = await supabase
        .from("shop_listings")
        .update({ quantity: qty, cmv })
        .eq("id", existing.id);
      if (!updErr) results.updated++;
      else results.flagged.push(`update failed: ${inv.id}`);
    } else if (price > 0 && qty > 0) {
      const insert = {
        title,
        inventory_item_id: inv.id,
        player_name: playerName,
        year,
        set_brand: setBrand,
        grade: normalizedGrade,
        condition,
        cert_number: inv.cert_number ?? null,
        price,
        cmv,
        quantity: qty,
        status: "active",
        publish_state: "published",
        sport: "Football",
        tags: inv.channel ? [inv.channel] : [],
      };
      const { error: insErr } = await supabase
        .from("shop_listings")
        .insert(insert);
      if (!insErr) results.created++;
      else results.flagged.push(`insert failed: ${inv.id}`);
    } else {
      results.skipped++;
    }
  }

  return NextResponse.json(results);
}
