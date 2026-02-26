import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

async function getAuthUserId() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

/**
 * GET /api/card-profile/[itemId]?from=business|collection
 *
 * Loads unified card profile data:
 *  - item details (from business_inventory_items or collection_items)
 *  - sales history (from business_sales, business mode only)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  try {
    const userId = await getAuthUserId();
    if (!userId)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { itemId } = await params;
    const from = request.nextUrl.searchParams.get("from") || "collection";

    const supabase = await createClient();

    if (from === "business") {
      // Load from business_inventory_items
      const { data: item, error: itemErr } = await supabase
        .from("business_inventory_items")
        .select("*")
        .eq("id", itemId)
        .eq("user_id", userId)
        .maybeSingle();

      if (itemErr && itemErr.code !== "PGRST116") throw itemErr;
      if (!item)
        return NextResponse.json({ error: "Not found" }, { status: 404 });

      // Load sales for this item
      const { data: sales } = await supabase
        .from("business_sales")
        .select("*")
        .eq("inventory_item_id", itemId)
        .eq("user_id", userId)
        .order("sale_date", { ascending: false });

      return NextResponse.json({
        item,
        sales: sales ?? [],
        mode: "business",
      });
    }

    // Load from collection_items (personal)
    const { data: item, error: itemErr } = await supabase
      .from("collection_items")
      .select("*")
      .eq("id", itemId)
      .eq("user_id", userId)
      .maybeSingle();

    if (itemErr && itemErr.code !== "PGRST116") throw itemErr;
    if (!item)
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({
      item,
      sales: [],
      mode: "collection",
    });
  } catch (err: any) {
    console.error("Card profile GET error:", err);
    return NextResponse.json(
      { error: "Failed to load card profile" },
      { status: 500 }
    );
  }
}
