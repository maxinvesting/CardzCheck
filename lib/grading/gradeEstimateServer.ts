import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { extractCardIdentityDetailed, type ImageInput } from "@/lib/card-identity";
import {
  resolveGradeEstimateImages,
  type ResolvedGradeEstimateImage,
} from "@/lib/grading/gradeEstimateImages";
import { parseGradeEstimateModelOutput } from "@/lib/grading/gradeEstimateModel";
import type { GradeEstimateJobDependencies } from "@/lib/grading/gradeEstimateJob";
import type { GradeEstimate } from "@/types";
import {
  fetchGradeCmv,
  computeWorthGrading,
  normalizeProbabilities,
  type GradeEstimatorCardInput,
} from "@/lib/grade-estimator/value";
import { DEFAULT_COMPS_WINDOW_DAYS } from "@/lib/grade-estimator/constants";

const SYSTEM_PROMPT = `You are a sports trading card grading expert with deep knowledge of PSA, BGS, SGC, and CGC grading standards. Your job is to analyze card condition and estimate grades based on centering, corners, surface, and edges.`;

const USER_PROMPT = `Analyze these photos of the SAME sports trading card and estimate its condition/grade. The card is RAW (not already in a slab).

You may receive multiple angles or lighting variations. Use all photos together and prioritize the clearest details.

1. CENTERING: Estimate the border ratios
   - Left/Right: Compare relative width of left vs right borders (e.g., "50/50", "55/45", "60/40")
   - Top/Bottom: Compare relative height of top vs bottom borders
   - Perfect centering is 50/50 on both axes. Anything worse than 60/40 significantly impacts grade.

2. CORNERS: Examine all four corners for:
   - Whitening or wear (white showing through color)
   - Dings or damage
   - Fraying or softness
   - Describe what you see (e.g., "Sharp on all 4 corners" or "Minor whitening on bottom-left corner")

3. SURFACE: Look for:
   - Scratches or scuffs
   - Print lines or factory defects
   - Staining or discoloration
   - Fingerprints or smudges
   - Describe what you see (e.g., "Clean, no visible scratches" or "Light surface scratches visible")

4. EDGES: Examine all four edges for:
   - Chipping
   - Rough cuts
   - Wear or whitening
   - Describe what you see (e.g., "Clean edges" or "Minor wear on top edge")

Based on these factors, estimate a PSA grade range on a 1-10 scale:
- 10 = Gem Mint (virtually perfect)
- 9 = Mint (minor flaw, one corner or centering)
- 8 = NM-MT (small flaw visible)
- 7 = NM (minor flaws on corners or surface)
- 6 = EX-MT (visible wear but still sharp)

IMPORTANT:
- Be conservative - it's better to underestimate than overestimate
- Photo quality affects accuracy - note if image quality limits your assessment
- Give a range (e.g., 7-9) to reflect uncertainty

Return ONLY valid JSON with this structure (no prose):
{
  "status": "ok" | "low_confidence" | "unable",
  "reason": "short reason",
  "estimated_grade_low": 0,
  "estimated_grade_high": 0,
  "centering": "",
  "corners": "",
  "surface": "",
  "edges": "",
  "grade_notes": "",
  "probabilities": [
    { "label": "PSA 10", "probability": 0.0 },
    { "label": "PSA 9", "probability": 0.0 },
    { "label": "PSA 8", "probability": 0.0 },
    { "label": "PSA 7 or lower", "probability": 0.0 }
  ],
  "bgs_probabilities": [
    { "label": "BGS 9.5", "probability": 0.0 },
    { "label": "BGS 9", "probability": 0.0 },
    { "label": "BGS 8.5", "probability": 0.0 },
    { "label": "BGS 8 or lower", "probability": 0.0 }
  ]
}

Rules:
- Always include status, reason, and both probability arrays.
- Probabilities must sum to 1.0 in each array.
- If low_confidence or unable, still return conservative probabilities with more weight on lower grades.
`;

function getAnthropicClient() {
  return new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });
}

async function runGradeModel(
  images: ResolvedGradeEstimateImage[]
): Promise<string | null> {
  const anthropic = getAnthropicClient();
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: [
          ...images.map((image) => ({
            type: "image" as const,
            source: {
              type: "base64" as const,
              media_type: image.mediaType,
              data: image.base64Image,
            },
          })),
          {
            type: "text",
            text: USER_PROMPT,
          },
        ],
      },
    ],
    system: SYSTEM_PROMPT,
  });

  const textContent = message.content.find((c) => c.type === "text");
  return textContent && textContent.type === "text" ? textContent.text : null;
}

async function runOcrIdentity(images: ResolvedGradeEstimateImage[]) {
  const inputs: ImageInput[] = images.map((image) => ({
    data: image.base64Image,
    mediaType: image.mediaType,
    source: image.source,
  }));
  const { cardIdentity } = await extractCardIdentityDetailed(inputs);
  return cardIdentity;
}

async function runPostGradingValue(options: {
  card: GradeEstimatorCardInput;
  gradeEstimate: GradeEstimate;
}) {
  const probabilities = normalizeProbabilities(
    options.gradeEstimate.grade_probabilities!
  );
  const windowDays = DEFAULT_COMPS_WINDOW_DAYS;

  const [raw, psa10, psa9, psa8, bgs95, bgs9, bgs85] = await Promise.all([
    fetchGradeCmv(options.card, "raw", windowDays),
    fetchGradeCmv(options.card, "psa10", windowDays),
    fetchGradeCmv(options.card, "psa9", windowDays),
    fetchGradeCmv(options.card, "psa8", windowDays),
    fetchGradeCmv(options.card, "bgs95", windowDays),
    fetchGradeCmv(options.card, "bgs9", windowDays),
    fetchGradeCmv(options.card, "bgs85", windowDays),
  ]);

  return computeWorthGrading(
    raw,
    { "10": psa10, "9": psa9, "8": psa8 },
    { "9.5": bgs95, "9": bgs9, "8.5": bgs85 },
    probabilities,
    options.gradeEstimate.grade_probabilities?.confidence ?? "medium"
  );
}

export function createGradeEstimateJobDependencies(): GradeEstimateJobDependencies {
  return {
    resolveImages: resolveGradeEstimateImages,
    runOcrIdentity,
    runGradeModel,
    parseModelOutput: async (options) => parseGradeEstimateModelOutput(options),
    runPostGradingValue,
  };
}
