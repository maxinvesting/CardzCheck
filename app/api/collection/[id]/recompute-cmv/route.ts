import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { CollectionItem } from "@/types";
import { buildPendingCmvUpdate, calculateCardCmvWithStatus } from "@/lib/cmv";
import { isTestMode } from "@/lib/test-mode";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  try {
    if (!id) {
      return NextResponse.json({ error: "Item ID required" }, { status: 400 });
    }

    if (isTestMode()) {
      return NextResponse.json({
        item: {
          id,
          cmv_status: "failed",
          cmv_value: null,
          cmv_error: "test_mode",
          cmv_updated_at: new Date().toISOString(),
        },
      });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: pendingRow, error: pendingError } = await supabase
      .from("collection_items")
      .update(buildPendingCmvUpdate())
      .eq("id", id)
      .eq("user_id", user.id)
      .select("*")
      .single();

    if (pendingError || !pendingRow) {
      return NextResponse.json(
        { error: "Card not found" },
        { status: 404 }
      );
    }

    const computation = await calculateCardCmvWithStatus(
      pendingRow as CollectionItem
    );

    const { data: updatedRow, error: updateError } = await supabase
      .from("collection_items")
      .update(computation.payload)
      .eq("id", id)
      .eq("user_id", user.id)
      .select("*")
      .single();

    if (updateError || !updatedRow) {
      return NextResponse.json(
        { error: "Failed to persist CMV recompute" },
        { status: 500 }
      );
    }

    return NextResponse.json({ item: updatedRow });
  } catch (error) {
    console.error("CMV recompute error:", error);
    return NextResponse.json(
      { error: "Failed to recompute CMV" },
      { status: 500 }
    );
  }
}

