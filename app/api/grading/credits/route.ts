import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getScanCreditStatus } from "@/lib/grading/scanCredits";
import { checkProAccess } from "@/lib/access";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const proAccess = await checkProAccess(user.id);

  // Paid users have unlimited scans (no credits system)
  if (proAccess.hasAccess) {
    return NextResponse.json({
      tier: proAccess.tier,
      unlimited: true,
      remaining: null,
      nextGrantAt: null,
    });
  }

  const credits = await getScanCreditStatus(user.id);

  return NextResponse.json({
    tier: "free",
    unlimited: false,
    remaining: credits.remaining,
    nextGrantAt: credits.nextGrantAt,
    lastGrantAt: credits.lastGrantAt,
  });
}
