import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Lightweight unread-conversation count for the seller, used to badge the
// Messages nav item. Returns the number of marketplace threads with unread
// seller messages. RLS scopes the query to the caller's own threads, so this
// is a cheap head-count with no row payload.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ unread: 0 });
  }

  const { count, error } = await supabase
    .from("marketplace_threads")
    .select("id", { count: "exact", head: true })
    .eq("seller_id", user.id)
    .gt("unread_count_seller", 0);

  if (error) {
    return NextResponse.json({ unread: 0 });
  }

  return NextResponse.json({ unread: count ?? 0 });
}
