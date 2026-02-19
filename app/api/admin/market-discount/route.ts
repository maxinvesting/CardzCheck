import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getAdminAuth } from "@/lib/admin";
import {
  buildMarketQueryFromCollectionCard,
  computeRobustSnapshotDebug,
  getMarketCmvForCollectionCard,
  getMarketDiscountDebugData,
  refreshMarketByFingerprint,
} from "@/lib/market-discount";

export async function GET(request: NextRequest) {
  const admin = await getAdminAuth();
  if (!admin.user) {
    return admin.unauthorizedResponse!;
  }

  const q = request.nextUrl.searchParams.get("q") ?? undefined;
  const fingerprint = request.nextUrl.searchParams.get("fingerprint") ?? undefined;
  const limitRaw = Number(request.nextUrl.searchParams.get("limit") ?? "30");
  const limit = Number.isFinite(limitRaw) ? limitRaw : 30;

  const data = await getMarketDiscountDebugData({
    query: q,
    fingerprint,
    limit,
  });

  const activeStats = data.selectedSnapshots.active
    ? computeRobustSnapshotDebug(data.selectedSnapshots.active.prices_cents)
    : null;
  const soldStats = data.selectedSnapshots.sold
    ? computeRobustSnapshotDebug(data.selectedSnapshots.sold.prices_cents)
    : null;

  const oldListingMedian = data.selectedFactor?.listing_median_cents
    ? Math.round((data.selectedFactor.listing_median_cents / 100) * 100) / 100
    : null;

  const newCmv = data.selectedCmv?.cmv ?? null;
  const deltaPct =
    oldListingMedian !== null && newCmv !== null && oldListingMedian > 0
      ? Math.round((((newCmv - oldListingMedian) / oldListingMedian) * 100) * 100) / 100
      : null;

  return NextResponse.json({
    ...data,
    selectedDistributions: {
      active: activeStats,
      sold: soldStats,
    },
    selectedComparison: {
      oldListingMedian,
      newCmv,
      deltaPct,
      method: data.selectedCmv?.method ?? "insufficient_data",
    },
  });
}

export async function POST(request: NextRequest) {
  const admin = await getAdminAuth();
  if (!admin.user) {
    return admin.unauthorizedResponse!;
  }

  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const action = typeof body.action === "string" ? body.action : "";

  if (action === "refresh") {
    const fingerprint = typeof body.fingerprint === "string" ? body.fingerprint : "";
    if (!fingerprint) {
      return NextResponse.json({ error: "fingerprint is required" }, { status: 400 });
    }

    const cmv = await refreshMarketByFingerprint(fingerprint, true);
    if (!cmv) {
      return NextResponse.json(
        { error: "No stored query metadata found for that fingerprint" },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, cmv });
  }

  if (action === "seed") {
    const service = await createServiceClient();
    const { data: items, error } = await service
      .from("collection_items")
      .select("player_name, year, set_name, grade, card_number, parallel_type, notes")
      .order("created_at", { ascending: false })
      .limit(40);

    if (error) {
      return NextResponse.json(
        { error: "Failed to load collection items", message: error.message },
        { status: 500 }
      );
    }

    const seen = new Set<string>();
    const seeded: Array<{ queryText: string; method: string; confidence: string }> = [];

    for (const row of items ?? []) {
      const query = buildMarketQueryFromCollectionCard({
        player_name: row.player_name,
        year: row.year,
        set_name: row.set_name,
        grade: row.grade,
        card_number: row.card_number,
        parallel_type: row.parallel_type,
        notes: row.notes,
      });
      const queryText = [query.player, query.year, query.set, query.grade, query.cardNumber, query.parallelType]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      if (!query.player || seen.has(queryText)) {
        continue;
      }

      seen.add(queryText);

      const result = await getMarketCmvForCollectionCard({
        card: {
          player_name: row.player_name,
          year: row.year,
          set_name: row.set_name,
          grade: row.grade,
          card_number: row.card_number,
          parallel_type: row.parallel_type,
          notes: row.notes,
        },
        force: true,
      });

      seeded.push({
        queryText,
        method: result.cmv.method,
        confidence: result.cmv.confidence,
      });

      if (seeded.length >= 10) {
        break;
      }
    }

    return NextResponse.json({
      ok: true,
      seededCount: seeded.length,
      seeded,
    });
  }

  return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
}
