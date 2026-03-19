import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getMessagingStats,
  getThreads,
} from "@/lib/messaging/service";
import type { ThreadFilter } from "@/lib/messaging/types";

const VALID_FILTERS: ThreadFilter[] = [
  "all",
  "unread",
  "needs_response",
  "offers",
  "resolved",
  "archived",
];

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const filter = (searchParams.get("filter") ?? "all") as ThreadFilter;
  if (!VALID_FILTERS.includes(filter)) {
    return NextResponse.json({ error: "Invalid filter" }, { status: 400 });
  }

  const [stats, threads] = await Promise.all([
    getMessagingStats(user.id),
    getThreads(user.id, filter),
  ]);

  return NextResponse.json({ stats, threads });
}
