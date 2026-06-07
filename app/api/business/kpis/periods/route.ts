import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getBusinessPeriodMetrics } from "@/lib/business/actions";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const periods = await getBusinessPeriodMetrics(user.id);
    return NextResponse.json({ periods });
  } catch (err: any) {
    if (err?.status === 403) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    console.error("Business period KPIs error:", err);
    return NextResponse.json(
      { error: "Failed to load period KPIs" },
      { status: 500 }
    );
  }
}
