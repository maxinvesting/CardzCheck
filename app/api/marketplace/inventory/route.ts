import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("collection_items")
    .select(
      "id, title, player_name, year, set_name, parallel_type, card_number, grade, grading_company, cert_number, estimated_cmv, est_cmv, image_url, status"
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: "inventory_fetch_failed", message: error.message },
      { status: 500 }
    );
  }

  const eligible = (data ?? []).filter((row: { grade: string | null; grading_company: string | null; status: string | null }) => {
    if (!row.grade || !row.grading_company) return false;
    if (row.status === "sold" || row.status === "pending_sale") return false;
    return true;
  });

  return NextResponse.json({ items: eligible });
}
