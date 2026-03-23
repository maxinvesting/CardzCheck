import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { extractCardIdentityDetailed, type ImageInput } from "@/lib/card-identity";
import type { CardIdentity } from "@/lib/card-identity/types";
import {
  resolveGradeEstimateImages,
  type ResolvedGradeEstimateImage,
} from "@/lib/grading/gradeEstimateImages";
import { parseGradeEstimateModelOutput } from "@/lib/grading/gradeEstimateModel";
import type { GradeEstimateJobDependencies } from "@/lib/grading/gradeEstimateJob";
import type { GradeEstimate } from "@/types";
import { isCloseupKind } from "@/lib/grading/scanPhotos";
import {
  fetchGradeCmv,
  computeWorthGrading,
  normalizeProbabilities,
  type GradeEstimatorCardInput,
} from "@/lib/grade-estimator/value";
import { DEFAULT_COMPS_WINDOW_DAYS } from "@/lib/grade-estimator/constants";
import { recordGradeTokenUsage } from "@/lib/grading/tokenBudget";
import {
  buildCategoryPromptNote,
  resolveGradingCategory,
} from "@/lib/grading/grading-profile";

const SYSTEM_PROMPT = `You are an expert trading card grading specialist with comprehensive knowledge of PSA, BGS, SGC, and TAG grading standards. Support sports cards and TCG cards (including Pokemon and One Piece). Produce strict JSON only.

Be accurate — calibrate your probabilities to the actual evidence in front of you. Do not systematically inflate or deflate grades. When the evidence clearly shows a gem-quality card, reflect that with high PSA 10 probability. When evidence is ambiguous or weak, widen the grade range and lower confidence_label rather than defaulting probabilities to lower grades.

CRITICAL: Grade the CARD, not the PHOTO. Photo quality issues (lighting, resolution, angle) should only affect your confidence_label and confidence_score — they must NOT directly lower your estimated_grade_low, estimated_grade_high, or shift probabilities toward lower grades. A card photographed in dim lighting is not a worse card.`;

const USER_PROMPT = `Analyze these photos of the SAME RAW (unslabbed) trading card.

Use ALL provided images. Better images increase analysis accuracy; explicitly reflect this in image_quality and confidence.

PSA grade standards (these must directly calibrate your probabilities):
- PSA 10 (Gem Mint): Near-perfect centering (55/45 or better on both axes), four sharp corners with no fraying, clean smooth surface with no scratches/stains/print lines, clean edges. ALL four categories must be exceptional.
- PSA 9 (Mint): One minor flaw allowed — slight surface imperfection OR centering up to 65/35. Corners nearly sharp, edges clean.
- PSA 8 (NM-MT): Slight wear on corners, one corner may show light fraying, light scratches visible on surface, centering up to 70/30.
- PSA 7 or lower: Multiple defects, significant wear, heavy centering issues, or notable surface damage.

Grading weighting rubric (must influence probabilities):
- Centering: 30% (primary gate — worst axis determines the ceiling)
- Surface: 30% (scratches, print lines, stains — most common PSA 10 killer)
- Corners: 20%
- Edges: 20%

Centering gate rules (must enforce):
- If centering is worse than 55/45 on either axis: PSA 10 is unlikely but not impossible.
- If centering is worse than 60/40 on either axis: PSA 10 must be very unlikely.
- If centering is worse than 65/35 on either axis: PSA 9 must be unlikely.
- Be quantitative and explicit with ratios.

Surface rules (must enforce):
- Extract explicit surface defects with location + severity.
- If glare/blur partially blocks surface reading, lower confidence and widen the grade range — but still grade what IS visible. Do not assume hidden defects exist; report only defects you can actually see.
- Distinguish between actual card defects (scratches, print lines, dents) and photo artifacts (reflections, lighting). Photo artifacts should reduce confidence, NOT lower the predicted grade range.

TCG strict profile rules (must enforce when card is Pokemon, One Piece, or other TCG):
- Edge whitening, edge chipping, corner whitening, rough cuts, and print lines are major gem-mint blockers.
- If multiple moderate edge/corner whitening/chipping findings exist, keep PSA 10 probability very low.
- Explain category-specific blockers explicitly in grade_notes and findings.

Close-up priority rules (must enforce when close-ups are available):
- Corners evidence must prioritize corner_tl/corner_tr/corner_bl/corner_br close-ups.
- Edges evidence must prioritize edges close-ups.
- Surface evidence must prioritize surface close-ups.
- If the relevant close-up kind is missing, fall back to front/back and explicitly mention that fallback.

Output ONLY valid JSON (no markdown, no prose) with this exact schema:
{
  "status": "ok" | "low_confidence" | "unable",
  "reason": "short reason",
  "estimated_grade_low": 0,
  "estimated_grade_high": 0,
  "grade_notes": "short synthesis",
  "image_quality": {
    "overall_image_score": 0,
    "subscores": {
      "focus_sharpness": 0,
      "lighting_glare_control": 0,
      "coverage_angles": 0,
      "resolution_distance": 0
    },
    "key_issues": ["..."],
    "retake_tips": ["... include explicit guidance that better photos = better analysis ..."]
  },
  "confidence": {
    "overall_confidence_score": 0,
    "confidence_label": "high" | "medium" | "low",
    "limiting_factors": ["..."],
    "what_was_clear": ["..."]
  },
  "centering": {
    "left_right_ratio": "55/45",
    "top_bottom_ratio": "52/48",
    "centering_confidence_score": 0,
    "centering_severity_0_3": 0,
    "centering_notes": "..."
  },
  "surface": "short summary",
  "corners": "short summary",
  "edges": "short summary",
  "surface_findings": [
    {
      "issue_type": "scratch|scuff|print_line|dent|dimple|stain|smudge|foil_roll|other",
      "location": "...",
      "severity_0_3": 0,
      "confidence_0_100": 0,
      "notes": "..."
    }
  ],
  "corners_findings": [
    {
      "issue_type": "corner_wear|dent|whitening|other",
      "location": "...",
      "severity_0_3": 0,
      "confidence_0_100": 0,
      "notes": "..."
    }
  ],
  "edges_findings": [
    {
      "issue_type": "edge_wear|chipping|rough_cut|whitening|other",
      "location": "...",
      "severity_0_3": 0,
      "confidence_0_100": 0,
      "notes": "..."
    }
  ],
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
  ],
  "evidence_sources": {
    "corners": ["corner_tl|corner_tr|corner_bl|corner_br|front|back|other"],
    "edges": ["edges|front|back|other"],
    "surface": ["surface|front|back|other"]
  },
  "visibility_notes": ["..."]
}

Hard requirements:
- Use integers for all *_score, confidence_0_100, severity_0_3 fields.
- Clamp: overall/confidence scores 0-100; subscores 0-25; severities 0-3.
- Provide 1-5 key_issues and 2-5 retake_tips.
- Probabilities in each array must sum to 1.0.
- If uncertain, widen the grade range and lower confidence_label — do NOT systematically shift probabilities lower simply due to uncertainty.`;

function getAnthropicClient() {
  return new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });
}

function buildCardContextNote(cardIdentity?: CardIdentity | null): string {
  if (!cardIdentity) return "";
  const parts: string[] = [];
  const category = resolveGradingCategory({
    sport: cardIdentity.sport,
    set_name: cardIdentity.setName,
    player_name: cardIdentity.player,
    year: cardIdentity.year,
  });

  parts.push(buildCategoryPromptNote(category));

  if (cardIdentity.cardStock === "chromium") {
    parts.push(
      "Card type: Chromium/refractor/prizm. Prioritize detecting: foil roll (wavy surface warping), " +
      "micro-scratches visible at angles under light, and surface contact marks. " +
      "These are common PSA 10 disqualifiers that may be invisible in flat photography — " +
      "lower surface confidence if no dedicated surface close-up is provided."
    );
  }

  if (cardIdentity.year && cardIdentity.year <= 1989) {
    parts.push(
      `Era: Vintage (${cardIdentity.year}). Vintage cards were not produced to modern tolerances. ` +
      "Moderate centering deviation and minor edge/corner wear are expected and should not " +
      "disqualify PSA 8+ if the card is otherwise clean for its age."
    );
  }

  if (parts.length === 0) return "";
  return `\nCard-specific context (apply to your assessment):\n${parts.join("\n")}`;
}

async function runGradeModel(
  images: ResolvedGradeEstimateImage[],
  cardIdentity?: CardIdentity | null,
  userId?: string | null,
  correctionText?: string | null
): Promise<string | null> {
  const closeupCount = images.filter((image) => isCloseupKind(image.kind)).length;
  const photoRoles = images
    .map(
      (image, index) =>
        `Photo ${index + 1}: ${image.kind.replace(/_/g, " ")}${
          image.kind === "front" || image.kind === "back"
            ? " (required base view)"
            : " (close-up)"
        }`
    )
    .join("\n");
  const cardContextNote = buildCardContextNote(cardIdentity);
  const photoRolePrompt = `Photo role map (use this for evidence attribution):\n${photoRoles}\n\nClose-up count: ${closeupCount}.\n${
    closeupCount === 0
      ? "No close-up photos were provided. Treat corners/edges/surface visibility as limited, include a limited visibility note, and avoid high confidence."
      : "Use close-up photos as primary evidence for the matching categories."
  }${cardContextNote}`;

  // Build the correction block when the user has supplied feedback
  const correctionBlock = correctionText?.trim()
    ? `\n\nUser correction (treat as ground truth — higher priority than your visual inference alone):\n"${correctionText.trim()}"\n\nRe-analyze the card taking this correction fully into account. Update your grade range, probabilities, findings, and grade_notes to reflect it.`
    : "";

  const anthropic = getAnthropicClient();
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: photoRolePrompt,
          },
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
            text: USER_PROMPT + correctionBlock,
          },
        ],
      },
    ],
    system: SYSTEM_PROMPT,
  });

  // Fire-and-forget usage recording — never blocks the response.
  if (userId) {
    recordGradeTokenUsage(userId, message.usage.input_tokens, message.usage.output_tokens).catch(
      (err) => console.error("[token-budget] recordGradeTokenUsage failed:", err)
    );
  }

  const textContent = message.content.find((c) => c.type === "text");
  return textContent && textContent.type === "text" ? textContent.text : null;
}

async function runOcrIdentity(images: ResolvedGradeEstimateImage[]) {
  const inputs = (
    await Promise.all(
      images.map(async (image): Promise<ImageInput | null> => {
        if (image.mediaType !== "image/gif") {
          return {
            data: image.base64Image,
            mediaType: image.mediaType,
            source: image.source,
          };
        }

        // OCR path accepts jpeg/png/webp; normalize gif uploads to png.
        try {
          const sharpModule = await import("sharp");
          const sharp = sharpModule.default;
          const pngBuffer = await sharp(Buffer.from(image.base64Image, "base64"), {
            failOnError: false,
            animated: true,
          })
            .png()
            .toBuffer();
          return {
            data: pngBuffer.toString("base64"),
            mediaType: "image/png",
            source: image.source,
          };
        } catch {
          return null;
        }
      })
    )
  ).filter((input): input is ImageInput => input !== null);

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

export function createGradeEstimateJobDependencies(userId?: string | null): GradeEstimateJobDependencies {
  return {
    resolveImages: resolveGradeEstimateImages,
    runOcrIdentity,
    // Bind userId via closure so token usage is recorded against the requesting user.
    // correctionText is passed through at call time from the job input.
    runGradeModel: (images, identity, correctionText) => runGradeModel(images, identity, userId, correctionText),
    parseModelOutput: async (options) => parseGradeEstimateModelOutput(options),
    runPostGradingValue,
  };
}
