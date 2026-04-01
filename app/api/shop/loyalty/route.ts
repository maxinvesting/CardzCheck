import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

const MILESTONE_INTERVAL = 15;

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.email) {
      return NextResponse.json({ purchaseCount: 0, nextMilestone: MILESTONE_INTERVAL, milestonesEarned: 0 });
    }

    const serviceClient = await createServiceClient();
    const { count, error } = await serviceClient
      .from("shop_orders")
      .select("*", { count: "exact", head: true })
      .eq("buyer_email", user.email)
      .eq("payment_status", "paid");

    if (error) {
      console.error("Loyalty API: failed to count orders", error);
      return NextResponse.json({ purchaseCount: 0, nextMilestone: MILESTONE_INTERVAL, milestonesEarned: 0 });
    }

    const purchaseCount = count ?? 0;
    const milestonesEarned = Math.floor(purchaseCount / MILESTONE_INTERVAL);
    const purchasesInCurrentCycle = purchaseCount % MILESTONE_INTERVAL;
    const nextMilestone = (milestonesEarned + 1) * MILESTONE_INTERVAL;

    return NextResponse.json({
      purchaseCount,
      nextMilestone,
      milestonesEarned,
      purchasesInCurrentCycle,
      milestoneInterval: MILESTONE_INTERVAL,
    });
  } catch (error) {
    console.error("Loyalty API error:", error);
    return NextResponse.json({ purchaseCount: 0, nextMilestone: MILESTONE_INTERVAL, milestonesEarned: 0 });
  }
}
