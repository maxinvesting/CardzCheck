import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import {
  buildFallbackGradeEstimate,
  buildImageStats,
} from "@/lib/grading/fallbackEstimate";
import {
  extractScanPhotos,
  resolveGradeEstimateImages,
} from "@/lib/grading/gradeEstimateImages";
import { parseGradeEstimateModelOutput } from "@/lib/grading/gradeEstimateModel";
import type { GradeScanCardMeta } from "@/lib/grading/gradeFeatures";
import {
  GRADE_SCAN_MAX_CLOSEUPS,
  GRADE_SCAN_MAX_TOTAL_PHOTOS,
  isCloseupKind,
} from "@/lib/grading/scanPhotos";
import {
  buildCategoryPromptNote,
  resolveGradingCategory,
} from "@/lib/grading/grading-profile";

function getAnthropicClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }
  return new Anthropic({ apiKey });
}


const SYSTEM_PROMPT = `You are a trading card grading specialist. Handle sports cards and TCG cards (including Pokemon and One Piece). Produce strict JSON only. Use conservative assumptions and never inflate high-grade odds when evidence is weak.`;

const USER_PROMPT = `Analyze these photos of the SAME RAW (unslabbed) trading card.

Use ALL provided images. Better images increase analysis accuracy; explicitly reflect this in image_quality and confidence.

Grading weighting rubric (must influence probabilities):
- Centering: 40% (primary gate)
- Surface: 30% (second-most important)
- Corners: 15%
- Edges: 15%

Centering gate rules (must enforce):
- If centering is worse than 60/40 on either axis, PSA 10 must be very unlikely.
- If centering is worse than 65/35 on either axis, PSA 9 must be unlikely.
- Be quantitative and explicit with ratios.

Surface rules (must enforce):
- Extract explicit surface defects with location + severity.
- If glare/blur blocks surface reading, say that clearly, lower confidence, and shift probabilities downward.

TCG strict profile rules (must enforce when card is Pokemon, One Piece, or other TCG):
- Edge whitening, edge chipping, corner whitening, rough cuts, and print lines are major gem-mint blockers.
- If multiple moderate edge/corner whitening/chipping findings exist, keep PSA 10 probability very low.
- Explain category-specific blockers explicitly in grade_notes and findings.

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
  ]
}

Hard requirements:
- Use integers for all *_score, confidence_0_100, severity_0_3 fields.
- Clamp: overall/confidence scores 0-100; subscores 0-25; severities 0-3.
- Provide 1-5 key_issues and 2-5 retake_tips.
- Probabilities in each array must sum to 1.0.
- If uncertain, widen range and shift probability mass lower (conservative).`;

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readYear(value: unknown): string | number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) return value.trim();
  return null;
}

export async function POST(request: NextRequest) {
  let imageStats = buildImageStats([]);

  try {
    const body = await request.json();
    const bodyCard = body?.card && typeof body.card === "object" ? body.card : null;
    const cardMeta: GradeScanCardMeta = {
      game: readString(body?.game) ?? readString(bodyCard?.game),
      sport: readString(body?.sport) ?? readString(bodyCard?.sport),
      player_name:
        readString(body?.player_name) ?? readString(bodyCard?.player_name),
      set_name: readString(body?.set_name) ?? readString(bodyCard?.set_name),
      year: readYear(body?.year) ?? readYear(bodyCard?.year),
      title: readString(body?.title) ?? null,
      chrome: null,
    };

    const scanPhotos = extractScanPhotos(body);

    if (scanPhotos.length === 0) {
      return NextResponse.json(
        { error: "Missing card images" },
        { status: 400 }
      );
    }

    if (!scanPhotos.some((photo) => photo.kind === "front") || !scanPhotos.some((photo) => photo.kind === "back")) {
      return NextResponse.json(
        { error: "Front and back photos are required." },
        { status: 400 }
      );
    }

    const closeupCount = scanPhotos.filter((photo) => isCloseupKind(photo.kind)).length;
    if (scanPhotos.length > GRADE_SCAN_MAX_TOTAL_PHOTOS) {
      return NextResponse.json(
        {
          error: "Too many images",
          reason: `Maximum ${GRADE_SCAN_MAX_TOTAL_PHOTOS} images allowed`,
        },
        { status: 400 }
      );
    }

    if (closeupCount > GRADE_SCAN_MAX_CLOSEUPS) {
      return NextResponse.json(
        {
          error: "Too many close-up images",
          reason: `Maximum ${GRADE_SCAN_MAX_CLOSEUPS} close-up images allowed`,
        },
        { status: 400 }
      );
    }

    let resolvedImages: Array<{
      base64Image: string;
      mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
      bytes: number;
    }> = [];

    try {
      const resolved = await resolveGradeEstimateImages(scanPhotos);
      resolvedImages = resolved.resolvedImages;
      imageStats = resolved.imageStats;
    } catch (error) {
      return NextResponse.json(
        {
          error: "Invalid image",
          reason: error instanceof Error ? error.message : "Invalid image",
        },
        { status: 400 }
      );
    }

    const categoryNote = buildCategoryPromptNote(resolveGradingCategory(cardMeta));
    const rolePrompt = `Photo role map:\n${scanPhotos
      .map((photo, index) => `${index + 1}. ${photo.kind.replace(/_/g, " ")}`)
      .join("\n")}\n${
      closeupCount === 0
        ? "\nNo close-up photos were provided. Treat corners/edges/surface visibility as limited and avoid high confidence."
        : "\nUse matching close-up types as primary evidence for corners, edges, and surface."
    }\n\n${categoryNote}`;

    // Process card image for grade estimation
    const anthropic = getAnthropicClient();
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: rolePrompt,
            },
            ...resolvedImages.map((image) => ({
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

    // Extract text response
    const textContent = message.content.find((c) => c.type === "text");
    const modelText =
      textContent && textContent.type === "text" ? textContent.text : null;
    const parsed = await parseGradeEstimateModelOutput({
      modelText,
      imageStats,
      scanPhotoKinds: scanPhotos.map((photo) => photo.kind),
      cardMeta,
    });
    return NextResponse.json(parsed.estimate);
  } catch (error) {
    console.error("Grade estimation error:", error);
    const fallback = buildFallbackGradeEstimate({
      imageStats,
      status: "unable",
      reason: error instanceof Error ? error.message : "Unknown error",
      warningCode: "unable",
    });
    return NextResponse.json(fallback);
  }
}
