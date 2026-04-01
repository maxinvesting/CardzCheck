import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createBusinessBillingPortal } from "@/lib/business/team-service";

export const dynamic = "force-dynamic";

export async function POST(): Promise<NextResponse> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const portal = await createBusinessBillingPortal({ actorUserId: user.id });
    return NextResponse.json(portal);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to open billing portal";
    const status = (error as { status?: number })?.status ?? 500;
    return NextResponse.json({ error: message }, { status });
  }
}

