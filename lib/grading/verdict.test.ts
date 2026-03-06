import { describe, expect, it } from "vitest";
import type { GradeEstimate } from "@/types";
import { buildGradeVerdict } from "./verdict";

function makeEstimate(
  overrides?: Partial<GradeEstimate>
): GradeEstimate {
  return {
    estimated_grade_low: 8,
    estimated_grade_high: 9,
    centering: "Clean centering",
    corners: "Sharp corners",
    surface: "Clean surface",
    edges: "Clean edges",
    grade_notes: "Strong overall card quality.",
    image_quality: {
      overall_image_score: 82,
      subscores: {
        focus_sharpness: 21,
        lighting_glare_control: 20,
        coverage_angles: 20,
        resolution_distance: 21,
      },
      key_issues: [],
      retake_tips: [],
    },
    confidence: {
      overall_confidence_score: 80,
      confidence_label: "high",
      limiting_factors: [],
      what_was_clear: [],
    },
    grade_probabilities: {
      psa: {
        "10": 0.22,
        "9": 0.46,
        "8": 0.2,
        "7_or_lower": 0.12,
      },
      bgs: {
        "9.5": 0.21,
        "9": 0.47,
        "8.5": 0.2,
        "8_or_lower": 0.12,
      },
      confidence: "high",
    },
    analysis_status: "ok",
    ...overrides,
  };
}

describe("buildGradeVerdict", () => {
  it("returns Rescan Needed when confidence is low", () => {
    const verdict = buildGradeVerdict(
      makeEstimate({
        grade_probabilities: {
          ...makeEstimate().grade_probabilities!,
          confidence: "low",
        },
        confidence: {
          ...makeEstimate().confidence!,
          overall_confidence_score: 45,
          confidence_label: "low",
        },
      })
    );

    expect(verdict.recommendation).toBe("Rescan Needed");
    expect(verdict.strategyTip).toContain("close-up");
  });

  it("returns Grade for strong PSA 9/10 probability", () => {
    const verdict = buildGradeVerdict(
      makeEstimate({
        grade_probabilities: {
          ...makeEstimate().grade_probabilities!,
          psa: { "10": 0.34, "9": 0.38, "8": 0.18, "7_or_lower": 0.1 },
        },
      })
    );

    expect(verdict.recommendation).toBe("Grade");
    expect(verdict.expectedOutcome.startsWith("PSA 9 (")).toBe(true);
  });

  it("returns Borderline for mixed distributions", () => {
    const verdict = buildGradeVerdict(
      makeEstimate({
        grade_probabilities: {
          ...makeEstimate().grade_probabilities!,
          confidence: "medium",
          psa: { "10": 0.16, "9": 0.31, "8": 0.3, "7_or_lower": 0.23 },
        },
      })
    );

    expect(verdict.recommendation).toBe("Borderline");
  });

  it("returns Sell Raw when low-grade outcomes dominate", () => {
    const verdict = buildGradeVerdict(
      makeEstimate({
        grade_probabilities: {
          ...makeEstimate().grade_probabilities!,
          confidence: "medium",
          psa: { "10": 0.04, "9": 0.18, "8": 0.32, "7_or_lower": 0.46 },
        },
      })
    );

    expect(verdict.recommendation).toBe("Sell Raw");
  });

  it("suggests graders based on profile", () => {
    const vintage = buildGradeVerdict(makeEstimate(), { year: "1986" });
    const modern = buildGradeVerdict(
      makeEstimate({
        grade_probabilities: {
          ...makeEstimate().grade_probabilities!,
          confidence: "medium",
          psa: { "10": 0.18, "9": 0.45, "8": 0.27, "7_or_lower": 0.1 },
        },
      }),
      { year: "2023" },
      { preferTag: true }
    );
    const highCeiling = buildGradeVerdict(
      makeEstimate({
        grade_probabilities: {
          ...makeEstimate().grade_probabilities!,
          psa: { "10": 0.8, "9": 0.1, "8": 0.06, "7_or_lower": 0.04 },
        },
      }),
      { year: "2010" }
    );

    expect(vintage.suggestedGrader).toBe("SGC");
    expect(modern.suggestedGrader).toBe("TAG");
    expect(highCeiling.suggestedGrader).toBe("BGS");
  });
});
