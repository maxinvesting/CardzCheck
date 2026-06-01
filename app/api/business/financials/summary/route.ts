import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getFinancialsSummary } from "@/lib/business/financials";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const summary = await getFinancialsSummary(user.id);
    return NextResponse.json(summary);
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    if (e?.status === 403) {
      return NextResponse.json(
        { error: e.message ?? "Forbidden" },
        { status: 403 }
      );
    }
    console.error("Financials summary error:", err);
    return NextResponse.json(
      { error: "Failed to load financials" },
      { status: 500 }
    );
  }
}
