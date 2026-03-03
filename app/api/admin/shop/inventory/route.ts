import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const admin = await getAdminAuth();
  if (!admin.user) {
    return admin.unauthorizedResponse!;
  }

  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const limitParam = Number(request.nextUrl.searchParams.get("limit") ?? "100");
  const limit = Math.min(200, Math.max(1, Number.isFinite(limitParam) ? Math.trunc(limitParam) : 100));

  const supabase = await createServiceClient();

  let query = supabase
    .from("business_inventory_items")
    .select(
      "id,title,quantity,grade,condition_status,list_price_cents,current_market_value_cents,channel,status,cert_number,created_at"
    )
    .eq("user_id", admin.user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (q.length > 0) {
    query = query.ilike("title", `%${q}%`);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Admin marketplace inventory fetch error:", error);
    return NextResponse.json(
      { error: "Failed to load inventory items" },
      { status: 500 }
    );
  }

  return NextResponse.json({ items: data ?? [] });
}
