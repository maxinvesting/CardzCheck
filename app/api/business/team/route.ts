import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getBusinessTeamDashboard } from "@/lib/business/team-service";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const team = await getBusinessTeamDashboard(user.id);
    return NextResponse.json(team);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load team";
    const status = (error as { status?: number })?.status ?? 500;
    return NextResponse.json({ error: message }, { status });
  }
}

