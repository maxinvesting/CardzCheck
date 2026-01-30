import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { LIMITS } from "@/types";
import { isTestMode } from "@/lib/test-mode";
import { calculateCardCmv } from "@/lib/cmv";

type BulkCollectionItemInput = {
  player_name: string;
  year?: string | null;
  set_name?: string | null;
  grade?: string | null;
  purchase_price?: number | null;
  purchase_date?: string | null;
  image_url?: string | null;
  notes?: string | null;
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { items?: BulkCollectionItemInput[] };
    const items = body.items || [];

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: "No items provided" },
        { status: 400 }
      );
    }

    if (items.length > 200) {
      return NextResponse.json(
        { error: "Too many items (max 200 per import)" },
        { status: 400 }
      );
    }

    // Validate upfront so we don't partially import.
    const errors: Array<{ index: number; error: string }> = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item?.player_name || !item.player_name.trim()) {
        errors.push({ index: i, error: "player_name is required" });
      }
    }
    if (errors.length) {
      return NextResponse.json(
        { error: "Validation failed", details: errors },
        { status: 400 }
      );
    }

    // Bypass auth and limits in test mode
    if (isTestMode()) {
      return NextResponse.json({
        imported: items.length,
        items: items.map((it, idx) => ({
          ...it,
          id: `test-${Date.now()}-${idx}`,
          user_id: "test-user-id",
          estimated_cmv: null,
          cmv_confidence: "unavailable",
          cmv_last_updated: new Date().toISOString(),
          created_at: new Date().toISOString(),
        })),
      });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check user limits
    const { data: userData } = await supabase
      .from("users")
      .select("is_paid")
      .eq("id", user.id)
      .single();

    const { count } = await supabase
      .from("collection_items")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id);

    const currentCount = count || 0;
    if (!userData?.is_paid && currentCount + items.length > LIMITS.FREE_COLLECTION) {
      return NextResponse.json(
        { error: "limit_reached", type: "collection" },
        { status: 403 }
      );
    }

    const insertPayload = items.map((it) => ({
      user_id: user.id,
      player_name: it.player_name.trim(),
      year: it.year || null,
      set_name: it.set_name || null,
      grade: it.grade || null,
      purchase_price: it.purchase_price ?? null,
      purchase_date: it.purchase_date || null,
      image_url: it.image_url || null,
      notes: it.notes || null,
    }));

    const { data: insertedItems, error } = await supabase
      .from("collection_items")
      .insert(insertPayload)
      .select("*");

    if (error) {
      throw error;
    }

    if (insertedItems && insertedItems.length > 0) {
      for (const item of insertedItems) {
        const cmvResult = await calculateCardCmv(item);
        await supabase
          .from("collection_items")
          .update(cmvResult)
          .eq("id", item.id)
          .eq("user_id", user.id);
      }
    }

    return NextResponse.json({ imported: insertedItems?.length || items.length });
  } catch (error) {
    console.error("Collection bulk import error:", error);
    return NextResponse.json(
      { error: "Failed to import collection" },
      { status: 500 }
    );
  }
}
