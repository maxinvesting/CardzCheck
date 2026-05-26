import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireBusinessOwnerContext } from "@/lib/business/context";
import {
  getMessagingOverview,
  type PlatformFilter,
} from "@/lib/messaging/service";
import { clearEbayMessagingCache, isEbayConnected } from "@/lib/messaging/adapters/ebay";
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
  console.info("[dbg:messages_api] auth_ok", { hasUser: true, ts: Date.now() });
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

  let [overview, ebayConnected] = await Promise.all([
    getMessagingOverview(user.id, filter, platform),
    isEbayConnected(user.id),
  ]);

  let retriedAfterEmpty = false;
  // Only retry the eBay cache when the eBay platform could have produced rows.
  const ebayCouldContribute = platform === "all" || platform === "ebay";
  if (ebayCouldContribute && ebayConnected && overview.stats.total_threads === 0 && overview.threads.length === 0) {
    clearEbayMessagingCache(user.id);
    overview = await getMessagingOverview(user.id, filter, platform);
    retriedAfterEmpty = true;
    console.info("[dbg:messages_api] retried_after_empty", {
      filter,
      totalThreads: overview.stats.total_threads,
      returnedThreads: overview.threads.length,
      ts: Date.now(),
    });
  }
  console.info("[dbg:messages_api] overview", {
    filter,
    ebayConnected,
    totalThreads: overview.stats.total_threads,
    returnedThreads: overview.threads.length,
    ts: Date.now(),
  });

  return NextResponse.json({
    stats: overview.stats,
    threads: overview.threads,
    ebayConnected,
    sync: {
      retriedAfterEmpty,
    },
  });
}
