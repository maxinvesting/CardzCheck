import { NextRequest, NextResponse } from "next/server";
import type { GradeProbabilities, WorthGradingResult } from "@/types";
import { fetchGradeCmv, computeWorthGrading, normalizeProbabilities } from "@/lib/grade-estimator/value";
import { DEFAULT_COMPS_WINDOW_DAYS } from "@/lib/grade-estimator/constants";
import { createClient } from "@/lib/supabase/server";

type GradeEstimatorValueRequest = {
  card: {
    player_name: string;
    year?: string;
    set_name?: string;
    card_number?: string;
    parallel_type?: string;
    variation?: string;
    insert?: string;
  };
  gradeProbabilities: GradeProbabilities;
  estimatorConfidence?: "high" | "medium" | "low";
  windowDays?: number;
};

export async function POST(request: NextRequest) {
  try {
    // Require a signed-in user — this endpoint fans out to external eBay CMV
    // lookups, so leaving it open invites denial-of-wallet abuse.
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as GradeEstimatorValueRequest;
    if (!body?.card?.player_name || !body.gradeProbabilities) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const windowDays = body.windowDays ?? DEFAULT_COMPS_WINDOW_DAYS;
    const probabilities = normalizeProbabilities(body.gradeProbabilities);

    const [raw, psa10, psa9, psa8, bgs95, bgs9, bgs85] = await Promise.all([
      fetchGradeCmv(body.card, "raw", windowDays),
      fetchGradeCmv(body.card, "psa10", windowDays),
      fetchGradeCmv(body.card, "psa9", windowDays),
      fetchGradeCmv(body.card, "psa8", windowDays),
      fetchGradeCmv(body.card, "bgs95", windowDays),
      fetchGradeCmv(body.card, "bgs9", windowDays),
      fetchGradeCmv(body.card, "bgs85", windowDays),
    ]);

    const result: WorthGradingResult = computeWorthGrading(
      raw,
      { "10": psa10, "9": psa9, "8": psa8 },
      { "9.5": bgs95, "9": bgs9, "8.5": bgs85 },
      probabilities,
      body.estimatorConfidence
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error("Grade estimator value error:", error);
    return NextResponse.json(
      { error: "Failed to estimate post-grading value" },
      { status: 500 }
    );
  }
}
