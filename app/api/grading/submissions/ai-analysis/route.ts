import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { scrapeEbaySoldListings } from "@/lib/ebay/scraper";
import {
  breakEvenGrade,
  getGradingFee,
  netProfitForScenario,
} from "@/lib/grading/preSubmissionRules";
import type { SubmissionAIWalkthroughResult } from "@/lib/grading/submissions/types";

interface RequestBody {
  title: string;
  cost_basis_cents: number | null;
}

async function fetchComp(
  title: string,
  gradeLabel: string | null
): Promise<{ price: number | null; count: number }> {
  try {
    const response = await scrapeEbaySoldListings({
      player: title,
      grade: gradeLabel ?? undefined,
      limit: 20,
    });

    const items = (response.items ?? []).filter((item) => {
      if (!gradeLabel) {
        // raw — exclude any graded listings
        return !/\b(PSA|BGS|SGC|CGC)\s*\d+(\.\d+)?\b/i.test(item.title);
      }
      return item.title.toLowerCase().includes(gradeLabel.toLowerCase());
    });

    const prices = items
      .map((i) => i.price)
      .filter((p) => Number.isFinite(p) && p > 0);

    const avg =
      prices.length > 0
        ? prices.reduce((a, b) => a + b, 0) / prices.length
        : null;

    return {
      price: avg !== null ? Math.round(avg * 100) / 100 : null,
      count: prices.length,
    };
  } catch {
    return { price: null, count: 0 };
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as RequestBody;
    const { title, cost_basis_cents } = body;

    if (!title?.trim()) {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }

    const rawCost = cost_basis_cents != null ? cost_basis_cents / 100 : 0;
    const gradingFee = getGradingFee("psa", "value"); // $32.99 PSA Value tier

    // Fetch eBay sold comps for all grade tiers in parallel
    const [psa10, psa9, psa8, raw] = await Promise.all([
      fetchComp(title, "PSA 10"),
      fetchComp(title, "PSA 9"),
      fetchComp(title, "PSA 8"),
      fetchComp(title, null),
    ]);

    // Use fallback multipliers when no sold comps found
    const rawPrice = raw.price ?? 0;
    const psa10Price = psa10.price ?? (rawPrice > 0 ? rawPrice * 2.5 : null);
    const psa9Price = psa9.price ?? (rawPrice > 0 ? rawPrice * 1.5 : null);
    const psa8Price = psa8.price ?? (rawPrice > 0 ? rawPrice * 1.1 : null);

    const profits = [
      {
        grade: "PSA 10",
        net: netProfitForScenario(psa10Price ?? 0, rawCost, gradingFee),
      },
      {
        grade: "PSA 9",
        net: netProfitForScenario(psa9Price ?? 0, rawCost, gradingFee),
      },
      {
        grade: "PSA 8",
        net: netProfitForScenario(psa8Price ?? 0, rawCost, gradingFee),
      },
    ];

    const computedBreakEven = breakEvenGrade(profits);
    const psa9Profit = profits.find((p) => p.grade === "PSA 9")?.net ?? 0;
    const psa10Profit = profits.find((p) => p.grade === "PSA 10")?.net ?? 0;

    // Build context for AI
    const contextData = {
      card: title,
      rawCost,
      gradingFee,
      costBasisProvided: cost_basis_cents != null,
      comps: {
        "PSA 10": {
          avgSoldPrice: psa10.price,
          count: psa10.count,
          usedFallback: psa10.price === null,
        },
        "PSA 9": {
          avgSoldPrice: psa9.price,
          count: psa9.count,
          usedFallback: psa9.price === null,
        },
        "PSA 8": {
          avgSoldPrice: psa8.price,
          count: psa8.count,
          usedFallback: psa8.price === null,
        },
        raw: {
          avgSoldPrice: raw.price,
          count: raw.count,
        },
      },
      profits,
      breakEvenGrade: computedBreakEven,
    };

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing API key" },
        { status: 500 }
      );
    }

    const anthropic = new Anthropic({ apiKey });

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: `You are a sports card grading ROI analyst. You receive eBay sold comp data and computed ROI figures for a card being considered for PSA grading.

Return ONLY a valid JSON object — no markdown, no fences, no commentary — with this exact structure:
{
  "pros": string[],
  "cons": string[],
  "verdict": "SUBMIT" | "BORDERLINE" | "SKIP",
  "keyNumbers": {
    "profitPsa9": number,
    "profitPsa10": number,
    "breakEvenGrade": string
  },
  "summary": string
}

VERDICT RULES:
- SUBMIT: PSA 9 net profit > $15 AND at least 3 real sold comps for PSA 9 (not fallback)
- BORDERLINE: PSA 9 profit > $0, or PSA 10 profit > $20 with reasonable data
- SKIP: PSA 9 is a loss AND PSA 10 profit is marginal, OR all comps are fallback estimates

WRITING RULES:
- 2–4 pros and 2–4 cons, one sentence each
- Every pro/con must cite a specific number from the data (price, count, profit)
- If a grade used fallback pricing (no real comps), always call that out as a con
- If cost basis was not provided (rawCost = 0), note that profit estimates are incomplete
- If fewer than 3 comps exist for PSA 9, that is always a con
- summary: one direct sentence — state the verdict and the single most important reason
- Sound like a sharp analyst giving real advice, not a template`,
      messages: [
        {
          role: "user",
          content: JSON.stringify(contextData),
        },
      ],
    });

    const responseText =
      message.content[0]?.type === "text" ? message.content[0].text : "";

    let parsed: SubmissionAIWalkthroughResult;
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON in response");
      const raw_parsed = JSON.parse(jsonMatch[0]);
      parsed = raw_parsed;
    } catch {
      // Graceful fallback if AI response fails to parse
      parsed = {
        pros:
          psa9Profit > 0
            ? [`PSA 9 net profit of $${psa9Profit.toFixed(0)} covers grading fee`]
            : [],
        cons:
          psa9Profit <= 0
            ? [`PSA 9 is a loss at current comps ($${psa9Profit.toFixed(0)})`]
            : [],
        verdict:
          psa9Profit > 15
            ? "SUBMIT"
            : psa9Profit > 0
            ? "BORDERLINE"
            : "SKIP",
        keyNumbers: {
          profitPsa9: psa9Profit,
          profitPsa10: psa10Profit,
          breakEvenGrade: computedBreakEven ?? "Unknown",
        },
        summary: "Analysis unavailable — check eBay manually before submitting.",
      };
    }

    // Always use our computed numbers for keyNumbers — don't trust the AI's math
    return NextResponse.json({
      ...parsed,
      keyNumbers: {
        profitPsa9: Math.round(psa9Profit * 100) / 100,
        profitPsa10: Math.round(psa10Profit * 100) / 100,
        breakEvenGrade: computedBreakEven ?? parsed.keyNumbers?.breakEvenGrade ?? "Unknown",
      },
    } satisfies SubmissionAIWalkthroughResult);
  } catch (error) {
    console.error("Submission AI analysis error:", error);
    return NextResponse.json(
      { error: "Failed to run AI analysis" },
      { status: 500 }
    );
  }
}
