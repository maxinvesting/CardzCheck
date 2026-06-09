import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireBusinessOwnerContext } from "@/lib/business/context";
import {
  getMessagingOverview,
  type PlatformFilter,
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

const VALID_PLATFORMS: PlatformFilter[] = ["all", "ebay", "cardzcheck"];

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await requireBusinessOwnerContext(user.id);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Owner access required";
    const status = (error as { status?: number })?.status ?? 403;
    return NextResponse.json({ error: message }, { status });
  }

  const { searchParams } = new URL(req.url);
  const filter = (searchParams.get("filter") ?? "all") as ThreadFilter;
  if (!VALID_FILTERS.includes(filter)) {
    return NextResponse.json({ error: "Invalid filter" }, { status: 400 });
  }
  const platform = (searchParams.get("platform") ?? "all") as PlatformFilter;
  if (!VALID_PLATFORMS.includes(platform)) {
    return NextResponse.json({ error: "Invalid platform" }, { status: 400 });
  }

  const overview = await getMessagingOverview(user.id, filter, platform);

  return NextResponse.json({
    stats: overview.stats,
    threads: overview.threads,
  });
}
