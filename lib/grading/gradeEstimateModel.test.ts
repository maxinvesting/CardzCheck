import { describe, expect, it } from "vitest";
import { parseGradeEstimateModelOutput } from "./gradeEstimateModel";
import { buildImageStats } from "./fallbackEstimate";
import type { GradeScanPhotoKind } from "@/types";
import type { GradeScanCardMeta } from "@/lib/grading/gradeFeatures";

async function runParse(
  payload: unknown,
  options?: { scanPhotoKinds?: GradeScanPhotoKind[]; cardMeta?: GradeScanCardMeta | null }
) {
  return parseGradeEstimateModelOutput({
    modelText: JSON.stringify(payload),
    imageStats: buildImageStats([250_000, 320_000, 410_000]),
    scanPhotoKinds: options?.scanPhotoKinds ?? ["front", "back", "surface"],
    cardMeta: options?.cardMeta ?? null,
  });
}

describe("parseGradeEstimateModelOutput", () => {
  it("accepts the enhanced schema and extracts new fields", async () => {
    const parsed = await runParse({
      status: "ok",
      reason: "Clear front/back with moderate glare",
      estimated_grade_low: 8,
      estimated_grade_high: 9,
      grade_notes: "Minor surface wear and slight centering offset.",
      image_quality: {
        overall_image_score: 78,
        subscores: {
          focus_sharpness: 22,
          lighting_glare_control: 18,
          coverage_angles: 19,
          resolution_distance: 19,
        },
        key_issues: ["Minor glare on chrome finish"],
        retake_tips: ["Use diffused light", "Better photos = more accurate grading."],
      },
      confidence: {
        overall_confidence_score: 74,
        confidence_label: "medium",
        limiting_factors: ["Glare on lower half"],
        what_was_clear: ["Corners and edges largely visible"],
      },
      centering: {
        left_right_ratio: "57/43",
        top_bottom_ratio: "55/45",
        centering_confidence_score: 81,
        centering_severity_0_3: 1,
        centering_notes: "Slightly right heavy but still competitive.",
      },
      surface: "One print line and light scuffing.",
      corners: "Mostly sharp.",
      edges: "Clean with minor specking.",
      surface_findings: [
        {
          issue_type: "print_line",
          location: "upper holo strip",
          severity_0_3: 1,
          confidence_0_100: 83,
          notes: "Thin horizontal line",
        },
      ],
      corners_findings: [],
      edges_findings: [],
      probabilities: [
        { label: "PSA 10", probability: 0.18 },
        { label: "PSA 9", probability: 0.52 },
        { label: "PSA 8", probability: 0.2 },
        { label: "PSA 7 or lower", probability: 0.1 },
      ],
      bgs_probabilities: [
        { label: "BGS 9.5", probability: 0.16 },
        { label: "BGS 9", probability: 0.5 },
        { label: "BGS 8.5", probability: 0.22 },
        { label: "BGS 8 or lower", probability: 0.12 },
      ],
    });

    expect(parsed.estimate.image_quality?.overall_image_score).toBe(78);
    expect(parsed.estimate.confidence?.overall_confidence_score).toBe(74);
    expect(parsed.estimate.centering_detail?.left_right_ratio).toBe("57/43");
    expect(parsed.estimate.surface_findings?.[0]?.issue_type).toBe("print_line");
  });

  it("falls back to low_confidence defaults when schema is missing", async () => {
    const parsed = await runParse({
      status: "ok",
      reason: "Minimal output",
      estimated_grade_low: 8,
      estimated_grade_high: 9,
      grade_notes: "Sparse response",
      probabilities: [
        { label: "PSA 10", probability: 0.4 },
        { label: "PSA 9", probability: 0.4 },
        { label: "PSA 8", probability: 0.1 },
        { label: "PSA 7 or lower", probability: 0.1 },
      ],
    });

    expect(parsed.estimate.analysis_status).toBe("low_confidence");
    expect(parsed.estimate.image_quality).toBeTruthy();
    expect(parsed.estimate.confidence).toBeTruthy();
    expect(parsed.estimate.centering_detail).toBeTruthy();
  });

  it("normalizes probabilities to sum to ~1.0", async () => {
    const parsed = await runParse({
      status: "ok",
      reason: "Provided percentages",
      estimated_grade_low: 7,
      estimated_grade_high: 9,
      grade_notes: "Percent-style input",
      image_quality: {
        overall_image_score: 60,
        subscores: {
          focus_sharpness: 15,
          lighting_glare_control: 14,
          coverage_angles: 16,
          resolution_distance: 15,
        },
        key_issues: ["Slight softness"],
        retake_tips: ["Use tripod", "Better photos = more accurate grading."],
      },
      confidence: {
        overall_confidence_score: 58,
        confidence_label: "medium",
        limiting_factors: ["Fine surface detail limited"],
        what_was_clear: ["Main structure"],
      },
      centering: {
        left_right_ratio: "58/42",
        top_bottom_ratio: "57/43",
        centering_confidence_score: 60,
        centering_severity_0_3: 1,
        centering_notes: "Moderate variance",
      },
      probabilities: [
        { label: "PSA 10", probability: 28 },
        { label: "PSA 9", probability: 41 },
        { label: "PSA 8", probability: 22 },
        { label: "PSA 7 or lower", probability: 9 },
      ],
      bgs_probabilities: [
        { label: "BGS 9.5", probability: 26 },
        { label: "BGS 9", probability: 44 },
        { label: "BGS 8.5", probability: 20 },
        { label: "BGS 8 or lower", probability: 10 },
      ],
    });

    const psaTotal = Object.values(parsed.estimate.grade_probabilities!.psa).reduce(
      (sum, value) => sum + value,
      0
    );
    const bgsTotal = Object.values(parsed.estimate.grade_probabilities!.bgs).reduce(
      (sum, value) => sum + value,
      0
    );

    expect(psaTotal).toBeGreaterThan(0.99);
    expect(psaTotal).toBeLessThan(1.01);
    expect(bgsTotal).toBeGreaterThan(0.99);
    expect(bgsTotal).toBeLessThan(1.01);
  });

  it("enforces centering gates for poor centering ratios", async () => {
    const parsed = await runParse({
      status: "ok",
      reason: "Poor centering but otherwise clean",
      estimated_grade_low: 8,
      estimated_grade_high: 10,
      grade_notes: "Strong card but clearly off center",
      image_quality: {
        overall_image_score: 85,
        subscores: {
          focus_sharpness: 22,
          lighting_glare_control: 21,
          coverage_angles: 21,
          resolution_distance: 21,
        },
        key_issues: ["Centering asymmetry"],
        retake_tips: ["Capture square frame", "Better photos = more accurate grading."],
      },
      confidence: {
        overall_confidence_score: 82,
        confidence_label: "high",
        limiting_factors: [],
        what_was_clear: ["Centering boundaries"],
      },
      centering: {
        left_right_ratio: "70/30",
        top_bottom_ratio: "64/36",
        centering_confidence_score: 92,
        centering_severity_0_3: 3,
        centering_notes: "Significant horizontal offset.",
      },
      probabilities: [
        { label: "PSA 10", probability: 0.45 },
        { label: "PSA 9", probability: 0.35 },
        { label: "PSA 8", probability: 0.15 },
        { label: "PSA 7 or lower", probability: 0.05 },
      ],
      bgs_probabilities: [
        { label: "BGS 9.5", probability: 0.45 },
        { label: "BGS 9", probability: 0.35 },
        { label: "BGS 8.5", probability: 0.15 },
        { label: "BGS 8 or lower", probability: 0.05 },
      ],
    });

    expect(parsed.estimate.grade_probabilities!.psa["10"]).toBeLessThanOrEqual(0.02);
    expect(parsed.estimate.grade_probabilities!.psa["9"]).toBeLessThanOrEqual(0.25);
  });

  it("applies strict Pokemon defect penalties to gem probabilities", async () => {
    const parsed = await runParse(
      {
        status: "ok",
        reason: "Visible edge whitening and print line",
        estimated_grade_low: 8,
        estimated_grade_high: 10,
        grade_notes: "TCG test",
        image_quality: {
          overall_image_score: 88,
          subscores: {
            focus_sharpness: 22,
            lighting_glare_control: 21,
            coverage_angles: 22,
            resolution_distance: 23,
          },
          key_issues: ["Tiny whitening on right edge"],
          retake_tips: ["Better photos = more accurate grading."],
        },
        confidence: {
          overall_confidence_score: 80,
          confidence_label: "high",
          limiting_factors: [],
          what_was_clear: ["Edges and corners visible"],
        },
        centering: {
          left_right_ratio: "54/46",
          top_bottom_ratio: "53/47",
          centering_confidence_score: 92,
          centering_severity_0_3: 0,
          centering_notes: "Within gem window.",
        },
        surface: "Light print line",
        corners: "Small whitening on one corner",
        edges: "Minor whitening on right edge",
        surface_findings: [
          {
            issue_type: "print_line",
            location: "mid holo",
            severity_0_3: 1,
            confidence_0_100: 82,
            notes: "thin line",
          },
        ],
        corners_findings: [
          {
            issue_type: "whitening",
            location: "top right",
            severity_0_3: 1,
            confidence_0_100: 85,
            notes: "small dot",
          },
        ],
        edges_findings: [
          {
            issue_type: "whitening",
            location: "right edge",
            severity_0_3: 1,
            confidence_0_100: 84,
            notes: "light whitening",
          },
        ],
        probabilities: [
          { label: "PSA 10", probability: 0.62 },
          { label: "PSA 9", probability: 0.27 },
          { label: "PSA 8", probability: 0.08 },
          { label: "PSA 7 or lower", probability: 0.03 },
        ],
        bgs_probabilities: [
          { label: "BGS 9.5", probability: 0.62 },
          { label: "BGS 9", probability: 0.27 },
          { label: "BGS 8.5", probability: 0.08 },
          { label: "BGS 8 or lower", probability: 0.03 },
        ],
      },
      {
        cardMeta: {
          game: "Pokemon",
          sport: "Pokemon",
          player_name: "Pikachu",
          set_name: "Pokemon 151",
          year: 2023,
        },
      }
    );

    expect(parsed.estimate.analysis_metadata?.card_category).toBe("pokemon");
    expect(parsed.estimate.analysis_metadata?.grading_profile).toBe(
      "pokemon_strict"
    );
    expect(parsed.estimate.grade_probabilities!.psa["10"]).toBeLessThanOrEqual(0.12);
    expect(parsed.estimate.model_version_used).toBe("rules:pokemon_strict");
  });

  it("clamps image/confidence score bounds", async () => {
    const parsed = await runParse({
      status: "ok",
      reason: "Out-of-range scores",
      estimated_grade_low: 7,
      estimated_grade_high: 8,
      grade_notes: "Bounds test",
      image_quality: {
        overall_image_score: 140,
        subscores: {
          focus_sharpness: 40,
          lighting_glare_control: -4,
          coverage_angles: 100,
          resolution_distance: -20,
        },
        key_issues: ["Bounds"],
        retake_tips: ["Better photos = more accurate grading."],
      },
      confidence: {
        overall_confidence_score: -25,
        confidence_label: "medium",
        limiting_factors: ["Bounds"],
        what_was_clear: ["Bounds"],
      },
      centering: {
        left_right_ratio: "56/44",
        top_bottom_ratio: "56/44",
        centering_confidence_score: 250,
        centering_severity_0_3: 8,
        centering_notes: "Bounds",
      },
      probabilities: [
        { label: "PSA 10", probability: 0.2 },
        { label: "PSA 9", probability: 0.4 },
        { label: "PSA 8", probability: 0.25 },
        { label: "PSA 7 or lower", probability: 0.15 },
      ],
      bgs_probabilities: [
        { label: "BGS 9.5", probability: 0.2 },
        { label: "BGS 9", probability: 0.4 },
        { label: "BGS 8.5", probability: 0.25 },
        { label: "BGS 8 or lower", probability: 0.15 },
      ],
    });

    expect(parsed.estimate.image_quality?.overall_image_score).toBe(100);
    expect(parsed.estimate.image_quality?.subscores.focus_sharpness).toBe(25);
    expect(parsed.estimate.image_quality?.subscores.lighting_glare_control).toBe(0);
    expect(parsed.estimate.confidence?.overall_confidence_score).toBe(0);
    expect(parsed.estimate.centering_detail?.centering_confidence_score).toBe(100);
    expect(parsed.estimate.centering_detail?.centering_severity_0_3).toBe(3);
  });

  it("produces distinct probabilities for cards with different evidence profiles", async () => {
    const highQuality = await runParse({
      status: "ok",
      reason: "Strong photos and clean card",
      estimated_grade_low: 8,
      estimated_grade_high: 10,
      grade_notes: "Clean copy",
      image_quality: {
        overall_image_score: 92,
        subscores: {
          focus_sharpness: 24,
          lighting_glare_control: 23,
          coverage_angles: 23,
          resolution_distance: 22,
        },
        key_issues: ["Tiny edge speck"],
        retake_tips: ["Great lighting", "Better photos = more accurate grading."],
      },
      confidence: {
        overall_confidence_score: 90,
        confidence_label: "high",
        limiting_factors: [],
        what_was_clear: ["All four corners", "Surface texture", "Centering ratios"],
      },
      centering: {
        left_right_ratio: "51/49",
        top_bottom_ratio: "52/48",
        centering_confidence_score: 92,
        centering_severity_0_3: 0,
        centering_notes: "Very strong centering.",
      },
      surface: "No significant defects.",
      corners: "Sharp corners.",
      edges: "Clean edges.",
      surface_findings: [],
      corners_findings: [],
      edges_findings: [],
      probabilities: [
        { label: "PSA 10", probability: 0.4 },
        { label: "PSA 9", probability: 0.4 },
        { label: "PSA 8", probability: 0.15 },
        { label: "PSA 7 or lower", probability: 0.05 },
      ],
    });

    const lowQuality = await runParse({
      status: "low_confidence",
      reason: "Blur and glare",
      estimated_grade_low: 7,
      estimated_grade_high: 9,
      grade_notes: "Surface difficult to assess due to glare.",
      image_quality: {
        overall_image_score: 38,
        subscores: {
          focus_sharpness: 10,
          lighting_glare_control: 7,
          coverage_angles: 9,
          resolution_distance: 12,
        },
        key_issues: ["Glare", "Blur"],
        retake_tips: ["Use diffused light", "Better photos = more accurate grading."],
      },
      confidence: {
        overall_confidence_score: 34,
        confidence_label: "low",
        limiting_factors: ["Surface blocked by glare", "Corners out of focus"],
        what_was_clear: ["General card shape"],
      },
      centering: {
        left_right_ratio: "62/38",
        top_bottom_ratio: "66/34",
        centering_confidence_score: 45,
        centering_severity_0_3: 3,
        centering_notes: "Off-center and uncertain due to blur.",
      },
      surface: "Unable to assess full surface due to glare.",
      corners: "Corners partially visible.",
      edges: "Edges soft in image.",
      surface_findings: [
        {
          issue_type: "other",
          location: "full front",
          severity_0_3: 2,
          confidence_0_100: 65,
          notes: "Assessment blocked by glare/blur",
        },
      ],
      corners_findings: [],
      edges_findings: [],
      probabilities: [
        { label: "PSA 10", probability: 0.2 },
        { label: "PSA 9", probability: 0.4 },
        { label: "PSA 8", probability: 0.25 },
        { label: "PSA 7 or lower", probability: 0.15 },
      ],
    });

    const highDist = highQuality.estimate.grade_probabilities!.psa;
    const lowDist = lowQuality.estimate.grade_probabilities!.psa;

    expect(highDist["10"]).toBeGreaterThan(lowDist["10"]);
    expect(highDist["9"]).toBeGreaterThan(lowDist["9"]);
    expect(lowDist["7_or_lower"]).toBeGreaterThan(highDist["7_or_lower"]);
  });

  it("caps confidence when no close-up photos are provided", async () => {
    const parsed = await runParse(
      {
        status: "ok",
        reason: "Clear base photos",
        estimated_grade_low: 8,
        estimated_grade_high: 10,
        grade_notes: "Clean card.",
        image_quality: {
          overall_image_score: 86,
          subscores: {
            focus_sharpness: 22,
            lighting_glare_control: 21,
            coverage_angles: 22,
            resolution_distance: 21,
          },
          key_issues: [],
          retake_tips: ["Better photos = more accurate grading."],
        },
        confidence: {
          overall_confidence_score: 88,
          confidence_label: "high",
          limiting_factors: [],
          what_was_clear: ["Centering", "General condition"],
        },
        centering: {
          left_right_ratio: "51/49",
          top_bottom_ratio: "52/48",
          centering_confidence_score: 90,
          centering_severity_0_3: 0,
          centering_notes: "Strong centering.",
        },
        surface: "Looks clean.",
        corners: "Looks sharp.",
        edges: "Looks clean.",
        probabilities: [
          { label: "PSA 10", probability: 0.3 },
          { label: "PSA 9", probability: 0.45 },
          { label: "PSA 8", probability: 0.18 },
          { label: "PSA 7 or lower", probability: 0.07 },
        ],
      },
      { scanPhotoKinds: ["front", "back"] }
    );

    expect(parsed.estimate.confidence?.overall_confidence_score).toBeLessThanOrEqual(65);
    expect(parsed.estimate.grade_probabilities?.confidence).not.toBe("high");
    expect(parsed.estimate.visibility_notes?.join(" ")).toContain("Limited visibility");
  });
});
