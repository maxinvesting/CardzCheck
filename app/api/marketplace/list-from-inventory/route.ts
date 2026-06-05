import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { computeListingCmv } from "@/lib/marketplace/pricing";
import { ebayColistPriceCents } from "@/lib/marketplace/lifecycle";

export const runtime = "nodejs";

/**
 * POST /api/marketplace/list-from-inventory
 *
 * Bridges a graded business-inventory card (collection_items, item_kind=inventory)
 * into the CardzCheck marketplace. Creates an auto-approved marketplace_cards
 * catalog row and a listing in one shot, then marks the inventory item listed.
 *
 *   pricing_mode = "cardzcheck"  -> full_service, price locked to CMV mid; we
 *                                   control pricing (auto 7.5% markdown at day 30).
 *   pricing_mode = "self_serve"  -> seller sets price; optional seller-configured
 *                                   automated price lowering.
 *
 * Optionally co-lists on the CardzCheck eBay store at +13.5% (price computed
 * server-side so seller take-home matches the marketplace price).
 */
const bodySchema = z
  .object({
    inventory_item_id: z.string().uuid(),
    pricing_mode: z.enum(["cardzcheck", "self_serve"]),
    list_price_cents: z.number().int().positive().optional(),
    shipping_cents: z.number().int().min(0).max(50000).optional(),
    auto_markdown: z
      .object({
        pct: z.number().gt(0).lt(1),
        interval_days: z.number().int().positive(),
        floor_cents: z.number().int().positive().nullable().optional(),
      })
      .optional(),
    ebay_colist: z.boolean().optional(),
  })
  .refine(
    (b) => b.pricing_mode !== "self_serve" || typeof b.list_price_cents === "number",
    { message: "list_price_cents is required for self_serve", path: ["list_price_cents"] }
  );

const KNOWN_GRADERS = new Set(["PSA", "BGS", "SGC", "CGC", "CSG", "HGA", "TAG"]);

function normalizeGrader(raw: string | null): string {
  const up = (raw ?? "").trim().toUpperCase();
  if (!up) return "RAW";
  if (KNOWN_GRADERS.has(up)) return up;
  return up.slice(0, 16);
}

function deriveManufacturer(setName: string | null, title: string | null): string {
  const hay = `${setName ?? ""} ${title ?? ""}`.toLowerCase();
  if (/panini|prizm|donruss|optic|select|mosaic|contenders|immaculate|national treasures/.test(hay)) {
    return "panini";
  }
  if (/topps|bowman|chrome|stadium club|allen|ginter|heritage/.test(hay)) {
    return "topps";
  }
  if (/upper deck|\bud\b|young guns/.test(hay)) return "upper deck";
  if (/fleer/.test(hay)) return "fleer";
  return "other";
}

function pickEstimatedValueCents(row: {
  list_price_cents: number | null;
  estimated_cmv: number | null;
  est_cmv: number | null;
  current_market_value_cents: number | null;
}): number | null {
  if (typeof row.current_market_value_cents === "number" && row.current_market_value_cents > 0) {
    return row.current_market_value_cents;
  }
  if (typeof row.estimated_cmv === "number" && row.estimated_cmv > 0) {
    return Math.round(row.estimated_cmv * 100);
  }
  if (typeof row.est_cmv === "number" && row.est_cmv > 0) {
    return Math.round(row.est_cmv * 100);
  }
  if (typeof row.list_price_cents === "number" && row.list_price_cents > 0) {
    return row.list_price_cents;
  }
  return null;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const input = parsed.data;

  // Load the inventory item (RLS-scoped to the user) and verify it's listable.
  const { data: item, error: itemErr } = await supabase
    .from("collection_items")
    .select(
      "id, user_id, title, player_name, year, set_name, parallel_type, card_number, grade, grading_company, cert_number, estimated_cmv, est_cmv, current_market_value_cents, list_price_cents, image_url, user_image_url, status, item_kind"
    )
    .eq("id", input.inventory_item_id)
    .eq("user_id", user.id)
    .eq("item_kind", "inventory")
    .maybeSingle();

  if (itemErr) {
    return NextResponse.json(
      { error: "item_lookup_failed", message: itemErr.message },
      { status: 500 }
    );
  }
  if (!item) {
    return NextResponse.json({ error: "item_not_found" }, { status: 404 });
  }
  if (!item.grade || !item.grading_company) {
    return NextResponse.json(
      { error: "card_not_graded", message: "Only graded cards can be listed on the marketplace." },
      { status: 422 }
    );
  }
  if (item.status === "sold" || item.status === "pending_sale" || item.status === "traded") {
    return NextResponse.json(
      { error: "item_not_available", message: `Card is ${item.status}.` },
      { status: 422 }
    );
  }

  // Require at least one user-uploaded photo before the card can be listed.
  // Stock/cert images (image_url) don't count — sellers must add their own.
  let hasUserPhotos = Boolean(item.user_image_url);
  if (!hasUserPhotos) {
    const { count } = await supabase
      .from("card_images")
      .select("id", { count: "exact", head: true })
      .eq("card_id", item.id)
      .eq("user_id", user.id);
    hasUserPhotos = (count ?? 0) > 0;
  }
  if (!hasUserPhotos) {
    return NextResponse.json(
      {
        error: "photos_required",
        message: "Add at least one photo of this card before listing it on the marketplace.",
      },
      { status: 422 }
    );
  }

  const estimatedValueCents = pickEstimatedValueCents(item) ?? input.list_price_cents ?? null;
  if (estimatedValueCents == null) {
    return NextResponse.json(
      { error: "value_unavailable", message: "No estimated value or price available for this card." },
      { status: 422 }
    );
  }

  const service = await createServiceClient();

  // 1. Reuse an existing source card if it was listed before, else create one.
  const cardImage = item.user_image_url || item.image_url || null;
  const { data: card, error: cardErr } = await service
    .from("marketplace_cards")
    .insert({
      title: item.set_name || item.title || item.player_name || "Card",
      player: item.player_name || item.title || "Unknown",
      year: Number.parseInt(String(item.year ?? "0"), 10) || 0,
      manufacturer: deriveManufacturer(item.set_name, item.title),
      grade: String(item.grade),
      grading_service: normalizeGrader(item.grading_company),
      cert_number: item.cert_number ?? null,
      parallel: item.parallel_type ?? null,
      card_number: item.card_number ?? null,
      estimated_value_cents: Math.max(100, estimatedValueCents),
      image_url: cardImage,
      source_user_id: user.id,
      source_inventory_item_id: item.id,
      intake_approved: true,
      pipeline_assigned_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (cardErr || !card) {
    console.error("list-from-inventory: card insert failed", cardErr);
    return NextResponse.json(
      { error: "card_insert_failed", message: cardErr?.message },
      { status: 500 }
    );
  }

  // 2. Resolve price. CMV failures are non-fatal — full_service falls back to
  // the card's estimated value so a listing can still be created.
  let cmv: Awaited<ReturnType<typeof computeListingCmv>>;
  try {
    cmv = await computeListingCmv(card.id);
  } catch (err) {
    console.error("list-from-inventory: cmv compute failed", err);
    cmv = {
      low_cents: null,
      mid_cents: null,
      high_cents: null,
      source: "insufficient_data",
      comps_count: 0,
      card_fingerprint: "",
      query_text: "",
    };
  }
  const mode = input.pricing_mode === "cardzcheck" ? "full_service" : "self_serve";

  let listPriceCents: number;
  if (mode === "full_service") {
    // CardzCheck pricing: price = CMV mid; fall back to the card's estimated
    // value if the comps engine can't produce a mid.
    listPriceCents = cmv.mid_cents ?? Math.max(100, estimatedValueCents);
  } else {
    listPriceCents = input.list_price_cents!;
  }

  const ebayColistEnabled = Boolean(input.ebay_colist);
  const ebayColistPrice = ebayColistEnabled ? ebayColistPriceCents(listPriceCents) : null;

  const autoMarkdown = mode === "self_serve" ? input.auto_markdown ?? null : null;

  // 3. Create the listing (auto-approved -> active).
  const { data: listing, error: listErr } = await service
    .from("listings")
    .insert({
      card_id: card.id,
      seller_id: user.id,
      mode,
      status: "active",
      list_price_cents: listPriceCents,
      shipping_cents: input.shipping_cents ?? 599,
      cmv_low_cents: cmv.low_cents,
      cmv_mid_cents: cmv.mid_cents,
      cmv_high_cents: cmv.high_cents,
      pipeline: "standard",
      fee_tier: mode === "self_serve" ? "one_pct" : "five_pct",
      fulfilled_by: mode === "self_serve" ? "seller" : "platform",
      source_inventory_item_id: item.id,
      auto_markdown_enabled: Boolean(autoMarkdown),
      auto_markdown_pct: autoMarkdown?.pct ?? null,
      auto_markdown_interval_days: autoMarkdown?.interval_days ?? null,
      auto_markdown_floor_cents: autoMarkdown?.floor_cents ?? null,
      last_markdown_at: autoMarkdown ? new Date().toISOString() : null,
      ebay_colist_enabled: ebayColistEnabled,
      ebay_colist_price_cents: ebayColistPrice,
    })
    .select(
      "id, list_price_cents, mode, status, cmv_low_cents, cmv_mid_cents, cmv_high_cents, ebay_colist_enabled, ebay_colist_price_cents, auto_markdown_enabled"
    )
    .single();

  if (listErr || !listing) {
    console.error("list-from-inventory: listing insert failed", listErr);
    // Roll back the orphan card row best-effort.
    await service.from("marketplace_cards").delete().eq("id", card.id);
    return NextResponse.json(
      { error: "listing_insert_failed", message: listErr?.message },
      { status: 500 }
    );
  }

  await service.from("pricing_history").insert({
    listing_id: listing.id,
    old_price_cents: null,
    new_price_cents: listPriceCents,
    reason: "initial",
    changed_by: user.id,
  });

  // 4. Reflect the listing on the inventory item.
  await service
    .from("collection_items")
    .update({ status: "listed", list_price_cents: listPriceCents })
    .eq("id", item.id)
    .eq("user_id", user.id);

  return NextResponse.json({ listing, cmv, card_id: card.id });
}
