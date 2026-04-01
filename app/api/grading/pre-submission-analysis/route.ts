import { NextRequest, NextResponse } from "next/server";
import { scrapeEbaySoldListings } from "@/lib/ebay/scraper";
import { buildCompsLinks } from "@/lib/ebay/comps-url";
import type { GradeEstimate } from "@/types";
import {
  breakEvenGrade,
  classifyCardStrength,
  computeRiskRating,
  computeVerdict,
  fallbackMultiplier,
  getGradingFee,
  netProfitForScenario,
  recommendedService,
  type GradingService,
  type GradingTierKey,
  type SubmissionContext,
} from "@/lib/grading/preSubmissionRules";

type GradeLabel = "PSA 10" | "PSA 9" | "PSA 8" | "BGS 9.5" | "BGS 9" | "BGS 8.5";

interface RequestBody {
  card: {
    player_name: string;
    year?: string;
    set_name?: string;
    parallel_type?: string;
    card_number?: string;
    variation?: string;
    insert?: string;
  };
  rawCost: number;
  gradingService: GradingService;
  serviceTier: GradingTierKey;
  showBgsComparison: boolean;
  estimate?: GradeEstimate | null;
}

function average(values: number[]): number | null {
  if (!values.length) return null;
  const sum = values.reduce((acc, value) => acc + value, 0);
  return sum / values.length;
}

function toIsoDateOrNull(value?: string): string | null {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return null;
  return new Date(timestamp).toISOString();
}

async function fetchGradeCompPrice(
  card: RequestBody["card"],
  gradeLabel: GradeLabel | "raw"
): Promise<{
  estimatePrice: number | null;
  count: number;
  latestDate: string | null;
}> {
  const response = await scrapeEbaySoldListings({
    player: card.player_name,
    year: card.year,
    set: card.set_name,
    grade: gradeLabel === "raw" ? undefined : gradeLabel,
    cardNumber: card.card_number,
    parallelType: card.parallel_type,
    variation: card.variation,
    keywords: card.insert ? [card.insert] : undefined,
    limit: 30,
  });

  const items = (response.items ?? []).filter((item) => {
    const title = item.title.toLowerCase();
    if (gradeLabel === "raw") {
      return !/\b(PSA|BGS|SGC|CGC)\s*\d+(\.\d+)?\b/i.test(item.title);
    }
    return title.includes(gradeLabel.toLowerCase());
  });

  const prices = items
    .map((item) => item.price)
    .filter((price) => Number.isFinite(price) && price > 0);
  const estimatePrice = average(prices);
  const latestDate = toIsoDateOrNull(items.map((item) => item.date).sort().at(-1));

  return {
    estimatePrice: estimatePrice === null ? null : Math.round(estimatePrice * 100) / 100,
    count: prices.length,
    latestDate,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as RequestBody;
    if (!body?.card?.player_name) {
      return NextResponse.json({ error: "Missing card identity" }, { status: 400 });
    }
    if (!Number.isFinite(body.rawCost) || body.rawCost < 0) {
      return NextResponse.json({ error: "Invalid raw cost" }, { status: 400 });
    }

    const cardContext: SubmissionContext = {
      setName: body.card.set_name,
      parallel: body.card.parallel_type,
      cardNumber: body.card.card_number,
      variation: body.card.variation,
      insert: body.card.insert,
    };

    const [raw, psa10, psa9, psa8, bgs95, bgs9, bgs85] = await Promise.all([
      fetchGradeCompPrice(body.card, "raw"),
      fetchGradeCompPrice(body.card, "PSA 10"),
      fetchGradeCompPrice(body.card, "PSA 9"),
      fetchGradeCompPrice(body.card, "PSA 8"),
      fetchGradeCompPrice(body.card, "BGS 9.5"),
      fetchGradeCompPrice(body.card, "BGS 9"),
      fetchGradeCompPrice(body.card, "BGS 8.5"),
    ]);

    const rawPrice = raw.estimatePrice ?? 0;
    const gradedPrice = {
      "PSA 10":
        psa10.estimatePrice ?? fallbackMultiplier(rawPrice, "PSA 10", cardContext),
      "PSA 9":
        psa9.estimatePrice ?? fallbackMultiplier(rawPrice, "PSA 9", cardContext),
      "PSA 8":
        psa8.estimatePrice ?? fallbackMultiplier(rawPrice, "PSA 8", cardContext),
      "BGS 9.5":
        bgs95.estimatePrice ?? fallbackMultiplier(rawPrice, "BGS 9.5", cardContext),
      "BGS 9":
        bgs9.estimatePrice ?? fallbackMultiplier(rawPrice, "BGS 9", cardContext),
      "BGS 8.5":
        bgs85.estimatePrice ?? fallbackMultiplier(rawPrice, "BGS 8.5", cardContext),
    } as const;

    const psaFee = getGradingFee("psa", body.serviceTier);
    const bgsFee = getGradingFee("bgs", "standard");
    const selectedFee = getGradingFee(body.gradingService, body.serviceTier);

    const psaProfits = [
      {
        grade: "PSA 10",
        net: netProfitForScenario(gradedPrice["PSA 10"], body.rawCost, psaFee),
      },
      {
        grade: "PSA 9",
        net: netProfitForScenario(gradedPrice["PSA 9"], body.rawCost, psaFee),
      },
      {
        grade: "PSA 8",
        net: netProfitForScenario(gradedPrice["PSA 8"], body.rawCost, psaFee),
      },
    ];
    const bgsProfits = [
      {
        grade: "BGS 9.5",
        net: netProfitForScenario(gradedPrice["BGS 9.5"], body.rawCost, bgsFee),
      },
      {
        grade: "BGS 9",
        net: netProfitForScenario(gradedPrice["BGS 9"], body.rawCost, bgsFee),
      },
      {
        grade: "BGS 8.5",
        net: netProfitForScenario(gradedPrice["BGS 8.5"], body.rawCost, bgsFee),
      },
    ];

    const psa9Profit = psaProfits.find((item) => item.grade === "PSA 9")?.net ?? 0;
    const psa10Profit = psaProfits.find((item) => item.grade === "PSA 10")?.net ?? 0;
    const risk = computeRiskRating(psa9Profit, psa10Profit);
    const cardStrength = classifyCardStrength(
      body.estimate ?? ({ grade_probabilities: { confidence: "medium" } } as GradeEstimate)
    );
    const verdict = computeVerdict(psa9Profit, cardStrength);
    const recommendation = recommendedService(cardContext, body.showBgsComparison);
    const compsLinks = buildCompsLinks({
      player: body.card.player_name,
      year: body.card.year,
      setName: body.card.set_name,
      parallel: body.card.parallel_type,
      cardNumber: body.card.card_number,
    });

    return NextResponse.json({
      recommendation,
      selected: {
        gradingService: body.gradingService,
        tier: body.serviceTier,
        gradingFee: selectedFee,
      },
      prices: gradedPrice,
      raw: {
        price: rawPrice,
        count: raw.count,
        latestDate: raw.latestDate,
      },
      comps: {
        "PSA 10": { count: psa10.count, latestDate: psa10.latestDate, source: "eBay sold" },
        "PSA 9": { count: psa9.count, latestDate: psa9.latestDate, source: "eBay sold" },
        "PSA 8": { count: psa8.count, latestDate: psa8.latestDate, source: "eBay sold" },
        "BGS 9.5": { count: bgs95.count, latestDate: bgs95.latestDate, source: "eBay sold" },
        "BGS 9": { count: bgs9.count, latestDate: bgs9.latestDate, source: "eBay sold" },
        "BGS 8.5": { count: bgs85.count, latestDate: bgs85.latestDate, source: "eBay sold" },
      },
      profits: {
        psa: psaProfits,
        bgs: bgsProfits,
      },
      breakEven: breakEvenGrade(psaProfits),
      riskRating: risk,
      verdict,
      verdictReasoning: `At $${selectedFee.toFixed(
        2
      )} grading fee your break-even is ${breakEvenGrade(psaProfits)}. Based on your card photos this looks like a ${cardStrength} submission.`,
      links: compsLinks,
      fallbackNotice:
        raw.count === 0 ||
        psa10.count === 0 ||
        psa9.count === 0 ||
        psa8.count === 0
          ? "No graded comps found yet - card may be too new. Estimates include raw-price fallback multipliers."
          : null,
    });
  } catch (error) {
    console.error("Pre-submission analysis error:", error);
    return NextResponse.json(
      { error: "Failed to build pre-submission analysis" },
      { status: 500 }
    );
  }
}
