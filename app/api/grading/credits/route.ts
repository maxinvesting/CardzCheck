import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getScanCreditStatus } from "@/lib/grading/scanCredits";
import { checkProAccess } from "@/lib/access";
import {
  checkGradeTokenBudget,
  getTierMonthlyBudgetCents,
} from "@/lib/grading/tokenBudget";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const proAccess = await checkProAccess(user.id);
  const maxCardsPerSession = proAccess.tier === "business" ? 10 : 1;
  const maxPhotosPerCard = 10;

  if (proAccess.hasAccess) {
    const budget = await checkGradeTokenBudget(user.id, proAccess.tier);
    return NextResponse.json({
      tier: proAccess.tier,
      unlimited: true,
      remaining: null,
      nextGrantAt: null,
      maxCardsPerSession,
      maxPhotosPerCard,
      monthlyBudgetCents: budget.budgetCents,
      monthlySpentCents: budget.spentCents,
      monthlyReservedCents: budget.reservedCents,
      monthlyRemainingCents: budget.remainingCents,
    });
  }

  const credits = await getScanCreditStatus(user.id);

  return NextResponse.json({
    tier: "free",
    unlimited: false,
    remaining: credits.remaining,
    nextGrantAt: credits.nextGrantAt,
    lastGrantAt: credits.lastGrantAt,
    maxCardsPerSession,
    maxPhotosPerCard,
    monthlyBudgetCents: getTierMonthlyBudgetCents("free"),
    monthlySpentCents: 0,
    monthlyReservedCents: 0,
    monthlyRemainingCents: 0,
  });
}
