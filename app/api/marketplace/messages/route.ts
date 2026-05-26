/**
 * GET /api/marketplace/messages
 *
 * Returns the threads where the current user is the BUYER. Mirrors the
 * seller-side /api/business/messages but without the business-owner gate.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCardzcheckBuyerThreads } from "@/lib/messaging/adapters/cardzcheck";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const threads = await getCardzcheckBuyerThreads(user.id);
  return NextResponse.json({ threads });
}
