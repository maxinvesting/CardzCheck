import { NextResponse } from "next/server";
import { type Hex } from "viem";
import { requireAdminUser } from "@/lib/auth";
import { getPublicClient } from "@/lib/chain";
import { inventoryVaultAbi, pegOracleAbi } from "@/lib/contracts";
import { publicConfig } from "@/lib/env";
import { normalizeListingInput, isBytes32, type ListingEditorPayload } from "@/lib/marketplace-listings";
import { getAdminSupabase } from "@/lib/supabase";

export const runtime = "nodejs";

type SkuAdminRow = {
  id: string;
  sku_id: `0x${string}`;
  name: string;
  details: Record<string, unknown> | null;
  image_url: string | null;
  status: "active" | "paused";
  card_year: string | null;
  set_name: string | null;
  player_name: string | null;
  card_number: string | null;
  parallel: string | null;
  grade: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type OracleState = {
  pegPrice: bigint;
  observedAt: bigint;
  nonce: bigint;
  halted: boolean;
  haltUntil: bigint;
};

function normalizeState(raw: unknown): OracleState {
  if (Array.isArray(raw)) {
    return {
      pegPrice: BigInt(raw[0] as string | number | bigint),
      observedAt: BigInt(raw[1] as string | number | bigint),
      nonce: BigInt(raw[2] as string | number | bigint),
      halted: Boolean(raw[3]),
      haltUntil: BigInt(raw[4] as string | number | bigint),
    };
  }

  const state = raw as OracleState;
  return state;
}

function detailValue(details: Record<string, unknown> | null, key: string): string {
  const value = details?.[key];
  return typeof value === "string" ? value : "";
}

async function loadChainState(skuId: `0x${string}`) {
  const client = getPublicClient();
  const [stateRaw, inventory] = await Promise.all([
    client.readContract({
      address: publicConfig.pegOracleAddress,
      abi: pegOracleAbi,
      functionName: "getState",
      args: [skuId as Hex],
    }),
    client.readContract({
      address: publicConfig.inventoryVaultAddress,
      abi: inventoryVaultAbi,
      functionName: "balanceOf",
      args: [publicConfig.marketAddress, BigInt(skuId)],
    }),
  ]);

  const state = normalizeState(stateRaw);

  return {
    availableQuantity: inventory.toString(),
    currentPegPrice: state.pegPrice.toString(),
    observedAt: state.observedAt > 0n ? new Date(Number(state.observedAt) * 1000).toISOString() : null,
    nonce: state.nonce.toString(),
  };
}

async function enrichListing(row: SkuAdminRow) {
  const chainState = await loadChainState(row.sku_id);

  return {
    id: row.id,
    skuId: row.sku_id,
    name: row.name,
    imageUrl: row.image_url,
    status: row.status,
    year: row.card_year ?? detailValue(row.details, "year"),
    set: row.set_name ?? detailValue(row.details, "set"),
    player: row.player_name ?? detailValue(row.details, "player"),
    cardNo: row.card_number ?? detailValue(row.details, "cardNo"),
    parallel: row.parallel ?? detailValue(row.details, "parallel"),
    grade: row.grade ?? detailValue(row.details, "grade"),
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...chainState,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export async function GET(request: Request) {
  const adminCheck = await requireAdminUser(request);
  if (!adminCheck.ok) {
    return adminCheck.response;
  }

  const supabase = getAdminSupabase();
  const { searchParams } = new URL(request.url);
  const skuId = searchParams.get("skuId")?.toLowerCase();

  try {
    if (skuId) {
      if (!isBytes32(skuId)) {
        return NextResponse.json({ error: "skuId must be 0x-prefixed bytes32" }, { status: 400 });
      }

      const [{ data: sku, error: skuError }, { data: recentComps, error: compsError }, { data: recentPegUpdates, error: pegError }] =
        await Promise.all([
          supabase
            .from("skus")
            .select(
              "id, sku_id, name, details, image_url, status, card_year, set_name, player_name, card_number, parallel, grade, notes, created_at, updated_at"
            )
            .eq("sku_id", skuId)
            .maybeSingle<SkuAdminRow>(),
          supabase
            .from("sold_comps")
            .select("id, sku_id, price_cents, sold_at, source, external_id, raw")
            .eq("sku_id", skuId)
            .order("sold_at", { ascending: false })
            .limit(12),
          supabase
            .from("peg_updates")
            .select("id, sku_id, peg_price, method, n, window_seconds, sales_hash, observed_at, nonce, tx_hash, created_at")
            .eq("sku_id", skuId)
            .order("observed_at", { ascending: false })
            .limit(12),
        ]);

      if (skuError) {
        return NextResponse.json({ error: skuError.message }, { status: 400 });
      }

      if (compsError) {
        return NextResponse.json({ error: compsError.message }, { status: 400 });
      }

      if (pegError) {
        return NextResponse.json({ error: pegError.message }, { status: 400 });
      }

      if (!sku) {
        return NextResponse.json({ error: "Listing not found" }, { status: 404 });
      }

      return NextResponse.json({
        listing: await enrichListing(sku),
        recentComps: recentComps ?? [],
        recentPegUpdates: recentPegUpdates ?? [],
      });
    }

    const page = clamp(Number(searchParams.get("page") ?? "1"), 1, 1000);
    const pageSize = clamp(Number(searchParams.get("pageSize") ?? "10"), 1, 25);
    const search = searchParams.get("search")?.trim();
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from("skus")
      .select(
        "id, sku_id, name, details, image_url, status, card_year, set_name, player_name, card_number, parallel, grade, notes, created_at, updated_at",
        { count: "exact" }
      )
      .order("updated_at", { ascending: false })
      .range(from, to);

    if (search) {
      const escaped = search.replaceAll(",", " ");
      query = query.or(
        `name.ilike.%${escaped}%,sku_id.ilike.%${escaped}%,player_name.ilike.%${escaped}%,set_name.ilike.%${escaped}%`
      );
    }

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const items = await Promise.all(((data ?? []) as SkuAdminRow[]).map((row) => enrichListing(row)));

    return NextResponse.json({
      items,
      page,
      pageSize,
      total: count ?? 0,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load admin listings";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(request: Request) {
  const adminCheck = await requireAdminUser(request);
  if (!adminCheck.ok) {
    return adminCheck.response;
  }

  try {
    const body = (await request.json()) as ListingEditorPayload;
    const normalized = normalizeListingInput(body);
    const supabase = getAdminSupabase();

    const { data, error } = await supabase
      .from("skus")
      .insert({
        sku_id: normalized.skuId,
        name: normalized.name,
        image_url: normalized.imageUrl,
        details: normalized.details,
        status: normalized.status,
        card_year: normalized.fingerprint.year,
        set_name: normalized.fingerprint.set,
        player_name: normalized.fingerprint.player,
        card_number: normalized.fingerprint.cardNo || null,
        parallel: normalized.fingerprint.parallel || null,
        grade: normalized.fingerprint.grade,
        notes: normalized.notes,
      })
      .select(
        "id, sku_id, name, details, image_url, status, card_year, set_name, player_name, card_number, parallel, grade, notes, created_at, updated_at"
      )
      .single<SkuAdminRow>();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ listing: await enrichListing(data) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create listing";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const adminCheck = await requireAdminUser(request);
  if (!adminCheck.ok) {
    return adminCheck.response;
  }

  try {
    const body = (await request.json()) as Partial<ListingEditorPayload> & { skuId?: string };
    const skuId = body.skuId?.toLowerCase();

    if (!skuId || !isBytes32(skuId)) {
      return NextResponse.json({ error: "skuId must be 0x-prefixed bytes32" }, { status: 400 });
    }

    const supabase = getAdminSupabase();
    const { data: existing, error: existingError } = await supabase
      .from("skus")
      .select(
        "id, sku_id, name, details, image_url, status, card_year, set_name, player_name, card_number, parallel, grade, notes, created_at, updated_at"
      )
      .eq("sku_id", skuId)
      .maybeSingle<SkuAdminRow>();

    if (existingError) {
      return NextResponse.json({ error: existingError.message }, { status: 400 });
    }

    if (!existing) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    const mergedPayload: ListingEditorPayload = {
      skuId,
      name: body.name ?? existing.name,
      imageUrl: body.imageUrl ?? existing.image_url,
      notes: body.notes ?? existing.notes,
      status: body.status ?? existing.status,
      year: body.year ?? existing.card_year ?? detailValue(existing.details, "year"),
      set: body.set ?? existing.set_name ?? detailValue(existing.details, "set"),
      player: body.player ?? existing.player_name ?? detailValue(existing.details, "player"),
      cardNo: body.cardNo ?? existing.card_number ?? detailValue(existing.details, "cardNo"),
      parallel: body.parallel ?? existing.parallel ?? detailValue(existing.details, "parallel"),
      grade: body.grade ?? existing.grade ?? detailValue(existing.details, "grade"),
    };

    const normalized = normalizeListingInput(mergedPayload);

    const { data, error } = await supabase
      .from("skus")
      .update({
        name: normalized.name,
        image_url: normalized.imageUrl,
        details: normalized.details,
        status: normalized.status,
        card_year: normalized.fingerprint.year,
        set_name: normalized.fingerprint.set,
        player_name: normalized.fingerprint.player,
        card_number: normalized.fingerprint.cardNo || null,
        parallel: normalized.fingerprint.parallel || null,
        grade: normalized.fingerprint.grade,
        notes: normalized.notes,
      })
      .eq("sku_id", skuId)
      .select(
        "id, sku_id, name, details, image_url, status, card_year, set_name, player_name, card_number, parallel, grade, notes, created_at, updated_at"
      )
      .single<SkuAdminRow>();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ listing: await enrichListing(data) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update listing";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
