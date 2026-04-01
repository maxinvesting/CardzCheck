import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/auth";
import { isBytes32, normalizeListingInput, type ListingEditorPayload } from "@/lib/marketplace-listings";
import { getAdminSupabase } from "@/lib/supabase";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const adminCheck = await requireAdminUser(request);
    if (!adminCheck.ok) {
      return adminCheck.response;
    }

    const body = (await request.json()) as {
      skuId?: string;
      name: string;
      imageUrl?: string;
      details?: Record<string, unknown>;
      notes?: string;
      status?: string;
      year?: string;
      set?: string;
      player?: string;
      cardNo?: string;
      parallel?: string;
      grade?: string;
    };

    const supabase = getAdminSupabase();
    const hasFingerprintFields =
      typeof body.year === "string" ||
      typeof body.set === "string" ||
      typeof body.player === "string" ||
      typeof body.grade === "string";

    let insertValues: Record<string, unknown>;

    if (hasFingerprintFields || !body.skuId) {
      const normalized = normalizeListingInput(body as ListingEditorPayload);
      insertValues = {
        id: randomUUID(),
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
      };
    } else {
      if (!body.skuId || !isBytes32(body.skuId)) {
        return NextResponse.json({ error: "skuId must be 0x-prefixed bytes32" }, { status: 400 });
      }

      if (!body.name?.trim()) {
        return NextResponse.json({ error: "name is required" }, { status: 400 });
      }

      insertValues = {
        id: randomUUID(),
        sku_id: body.skuId.toLowerCase(),
        name: body.name.trim(),
        image_url: body.imageUrl?.trim() || null,
        details: body.details ?? {},
        status: body.status === "paused" ? "paused" : "active",
        card_year: typeof body.details?.year === "string" ? body.details.year : null,
        set_name: typeof body.details?.set === "string" ? body.details.set : null,
        player_name: typeof body.details?.player === "string" ? body.details.player : null,
        card_number: typeof body.details?.cardNo === "string" ? body.details.cardNo : null,
        parallel: typeof body.details?.parallel === "string" ? body.details.parallel : null,
        grade: typeof body.details?.grade === "string" ? body.details.grade : null,
        notes: body.notes?.trim() || null,
      };
    }

    const { data, error } = await supabase
      .from("skus")
      .insert(insertValues)
      .select(
        "id, sku_id, name, image_url, details, status, card_year, set_name, player_name, card_number, parallel, grade, notes, created_at, updated_at"
      )
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "create sku failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
