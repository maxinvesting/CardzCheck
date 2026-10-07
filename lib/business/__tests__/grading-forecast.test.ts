import { describe, expect, it } from "vitest";
import {
  allInCostCents,
  breakEvenGrade,
  buildGradingForecast,
  gradeTiersFor,
  normalizeValueEstimates,
} from "../grading-forecast";

describe("grading forecast", () => {
  it("picks grade tiers per company", () => {
    expect(gradeTiersFor("PSA")).toEqual(["10", "9", "8", "7"]);
    expect(gradeTiersFor("bgs")).toEqual(["10", "9.5", "9", "8.5"]);
    expect(gradeTiersFor(null)).toEqual(["10", "9", "8", "7"]);
  });

  it("computes profit and ROI against all-in cost, highest grade first", () => {
    const cost = allInCostCents({ cost_basis_total_cents: 20000, fees_paid_cents: 6000 });
    expect(cost).toBe(26000);
    const rows = buildGradingForecast({ "9": 30000, "10": 80000, "8": 20000 }, cost);
    expect(rows.map((r) => r.grade)).toEqual(["10", "9", "8"]);
    expect(rows[0]).toMatchObject({ valueCents: 80000, profitCents: 54000 });
    expect(rows[2].profitCents).toBe(-6000);
    expect(rows[1].roi).toBeCloseTo(4000 / 26000);
    expect(breakEvenGrade(rows)).toBe("9");
  });

  it("drops junk values", () => {
    expect(normalizeValueEstimates({ "10": -5, "9": "abc" })).toBeNull();
    expect(normalizeValueEstimates({ "10": "1500" })).toEqual({ "10": 1500 });
    expect(buildGradingForecast(null, 100)).toEqual([]);
  });
});
