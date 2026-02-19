import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getBusinessMetrics } from "@/lib/business/actions";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const metrics = await getBusinessMetrics(user.id);
    return NextResponse.json(metrics);
  } catch (err: any) {
    if (err?.status === 403)
      return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("Business metrics error:", err);
    return NextResponse.json(
      { error: "Failed to load metrics" },
      { status: 500 }
    );
  }
}
