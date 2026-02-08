import { describe, expect, it } from "vitest";
import { buildFallbackGradeEstimate, buildImageStats } from "./fallbackEstimate";

describe("buildFallbackGradeEstimate", () => {
  it("returns probabilities for unable status", () => {
    const imageStats = buildImageStats([150000, 240000]);
    const estimate = buildFallbackGradeEstimate({
      imageStats,
      status: "unable",
      reason: "Model unavailable",
      warningCode: "unable",
    });

    expect(estimate.analysis_status).toBe("unable");
    expect(estimate.grade_probabilities?.psa).toBeTruthy();
    expect(estimate.grade_probabilities?.bgs).toBeTruthy();
    const psaTotal = Object.values(estimate.grade_probabilities?.psa ?? {}).reduce(
      (sum, value) => sum + value,
      0
    );
    expect(psaTotal).toBeGreaterThan(0.99);
    expect(psaTotal).toBeLessThan(1.01);
  });
});
