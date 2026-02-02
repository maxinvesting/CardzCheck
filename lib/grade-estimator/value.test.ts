import { describe, expect, it } from "vitest";
import { computeWorthGrading, isRawListing } from "./value";
import type { GradeCmv, GradeProbabilities } from "../../types";

const baseProbabilities: GradeProbabilities = {
  psa: { "10": 0.12, "9": 0.65, "8": 0.2, "7_or_lower": 0.03 },
  bgs: { "9.5": 0.12, "9": 0.65, "8.5": 0.2, "8_or_lower": 0.03 },
  confidence: "high",
};

function cmv(price: number | null, n = 10): GradeCmv {
  return { price, n, method: price === null ? "none" : "median" };
}

describe("computeWorthGrading", () => {
  it("returns maybe/no for high-pop modern with thin PSA 9 premium", () => {
    const result = computeWorthGrading(
      cmv(100, 12),
      { "10": cmv(140), "9": cmv(110), "8": cmv(90) },
      { "9.5": cmv(145), "9": cmv(112), "8.5": cmv(95) },
      baseProbabilities,
      "high",
      { psa: 40, bgs: 55 }
    );

    expect(result.rating === "maybe" || result.rating === "no").toBe(true);
  });

  it("returns strong yes for iconic vintage premiums", () => {
    const result = computeWorthGrading(
      cmv(500, 20),
      { "10": cmv(1500), "9": cmv(1000), "8": cmv(700) },
      { "9.5": cmv(1400), "9": cmv(950), "8.5": cmv(650) },
      baseProbabilities,
      "high",
      { psa: 40, bgs: 55 }
    );

    expect(["yes", "strong_yes"]).toContain(result.rating);
  });

  it("falls back when a grade is missing and downgrades confidence", () => {
    const result = computeWorthGrading(
      cmv(120, 10),
      { "10": cmv(null, 2), "9": cmv(200, 2), "8": cmv(150, 2) },
      { "9.5": cmv(null, 2), "9": cmv(190, 2), "8.5": cmv(140, 2) },
      baseProbabilities,
      "high",
      { psa: 40, bgs: 55 }
    );

    expect(result.confidence).not.toBe("high");
    expect(result.rating).toBe("maybe");
  });
});

describe("isRawListing", () => {
  it("excludes graded titles", () => {
    expect(isRawListing("2018 Panini Prizm Luka Doncic PSA 10")).toBe(false);
    expect(isRawListing("2019 Topps Chrome Zion Raw")).toBe(true);
  });
});
