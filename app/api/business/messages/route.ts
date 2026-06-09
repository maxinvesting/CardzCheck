import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasBusinessOwnerAccess } from "@/lib/business/context";
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

  // Freemium: any authenticated marketplace seller can read their own inbox
  // (threads are RLS-scoped to seller_id). The paid AI deal-desk is gated
  // separately on the ai-reply endpoint; `isBusiness` tells the client whether
  // to surface those tools or an upgrade nudge.
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

  const [overview, isBusiness] = await Promise.all([
    getMessagingOverview(user.id, filter, platform),
    hasBusinessOwnerAccess(user.id),
  ]);

  return NextResponse.json({
    stats: overview.stats,
    threads: overview.threads,
    isBusiness,
  });
}
