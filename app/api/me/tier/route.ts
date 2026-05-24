import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTierGates, getWeeklyAnalystUsage } from "@/lib/access";

/**
 * Lightweight endpoint for client-side gating. Returns the caller's
 * effective tier plus the gate flags so UI can hide pro-only affordances
 * without bundling lib/access into the client.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const gates = await getTierGates(user.id);
  const analyst = await getWeeklyAnalystUsage(user.id);

  return NextResponse.json({
    tier: gates.tier,
    gates: {
      canBulkAddByCert: gates.canBulkAddByCert,
      canMultiCardScan: gates.canMultiCardScan,
      maxGradeScanSlots: gates.maxGradeScanSlots,
      analystWeeklyLimit: gates.analystWeeklyLimit,
      inventoryItemCap: gates.inventoryItemCap,
      canSellOnMarketplace: gates.canSellOnMarketplace,
      marketplaceFees: gates.marketplaceFees,
    },
    analyst,
  });
}
