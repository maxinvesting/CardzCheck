import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { updateItemKind } from "@/lib/business/actions";

async function getAuthUserId() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

/**
 * POST /api/business/inventory/toggle-kind
 * Body: { id: string, target_kind: "owned" | "inventory", cost_basis_total_cents?: number }
 *
 * Moves a card between Personal Collection (owned) and Business Inventory (inventory).
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthUserId();
    if (!userId)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { id, target_kind, cost_basis_total_cents } = body;

    if (!id || typeof id !== "string") {
      return NextResponse.json({ error: "Item id required" }, { status: 400 });
    }

    if (target_kind !== "owned" && target_kind !== "inventory") {
      return NextResponse.json(
        { error: "target_kind must be 'owned' or 'inventory'" },
        { status: 400 }
      );
    }

    await updateItemKind(userId, id, target_kind, {
      cost_basis_total_cents:
        typeof cost_basis_total_cents === "number"
          ? cost_basis_total_cents
          : undefined,
    });

    return NextResponse.json({ success: true, id, item_kind: target_kind });
  } catch (err: any) {
    if (err?.status === 403)
      return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("Toggle item kind error:", err);
    return NextResponse.json(
      { error: "Failed to update item kind" },
      { status: 500 }
    );
  }
}
