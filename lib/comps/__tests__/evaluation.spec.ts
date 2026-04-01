import { describe, expect, it } from "vitest";
import { buildCompEvaluation } from "@/lib/comps/evaluation";
import type { ForSaleItem } from "@/lib/ebay/types";

function makeItem(title: string, price: number): ForSaleItem {
  return {
    title,
    price,
    url: `https://example.com/${encodeURIComponent(title)}`,
  };
}

describe("buildCompEvaluation", () => {
  it("rejects wrong parallel listings", () => {
    const result = buildCompEvaluation({
      items: [
        makeItem("2024 Panini Prizm Silver Jayden Daniels #349 PSA 10", 120),
        makeItem("2024 Panini Prizm Gold Jayden Daniels #349 PSA 10", 700),
      ],
      query: {
        player: "Jayden Daniels",
        set: "Panini Prizm",
        parallelType: "Silver",
        grade: "PSA 10",
        cardNumber: "349",
      },
      passUsed: "strict",
      marketMethod: "listing_adjusted",
      soldCount: 0,
    });

    expect(result.exactCompCount).toBe(1);
    expect(result.rejectedCompCount).toBe(1);
    expect(result.excludeReasonSummary.join(" ")).toContain("Wrong parallel");
  });

  it("caps suspicious outlier influence", () => {
    const items = [
      makeItem("2024 Panini Prizm Silver Jayden Daniels #349 PSA 10", 100),
      makeItem("2024 Panini Prizm Silver Jayden Daniels #349 PSA 10", 102),
      makeItem("2024 Panini Prizm Silver Jayden Daniels #349 PSA 10", 98),
      makeItem("2024 Panini Prizm Silver Jayden Daniels #349 PSA 10", 101),
      makeItem("2024 Panini Prizm Silver Jayden Daniels #349 PSA 10", 360),
    ];

    const result = buildCompEvaluation({
      items,
      query: {
        player: "Jayden Daniels",
        set: "Panini Prizm",
        parallelType: "Silver",
        grade: "PSA 10",
        cardNumber: "349",
      },
      passUsed: "strict",
      marketMethod: "listing_adjusted",
      soldCount: 0,
    });

    expect(result.rejectedComps.some((comp) => comp.excludeReasonCodes.includes("suspicious_outlier"))).toBe(true);
    expect(result.midpoint).toBeLessThan(150);
  });

  it("drops confidence when broad fallback is used", () => {
    const items = [
      makeItem("2024 Panini Prizm Jayden Daniels #349 PSA 10", 115),
      makeItem("2024 Panini Prizm Jayden Daniels #349 PSA 10", 118),
      makeItem("2024 Panini Prizm Jayden Daniels #349 PSA 10", 120),
    ];

    const strictResult = buildCompEvaluation({
      items,
      query: {
        player: "Jayden Daniels",
        set: "Panini Prizm",
        grade: "PSA 10",
        cardNumber: "349",
      },
      passUsed: "strict",
      marketMethod: "listing_adjusted",
      soldCount: 0,
    });

    const broadResult = buildCompEvaluation({
      items,
      query: {
        player: "Jayden Daniels",
        set: "Panini Prizm",
        grade: "PSA 10",
        cardNumber: "349",
      },
      passUsed: "broad",
      marketMethod: "listing_adjusted",
      soldCount: 0,
    });

    expect(broadResult.confidenceScore).toBeLessThan(strictResult.confidenceScore);
    expect(broadResult.disclaimerStates).toContain("active_listing_heavy_estimate");
  });
});
