import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import {
  buildFallbackGradeEstimate,
  buildImageStats,
} from "@/lib/grading/fallbackEstimate";
import {
  extractImageUrls,
  resolveGradeEstimateImages,
} from "@/lib/grading/gradeEstimateImages";
import { parseGradeEstimateModelOutput } from "@/lib/grading/gradeEstimateModel";

function getAnthropicClient() {
  return new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });
}


const SYSTEM_PROMPT = `You are a sports card grading specialist. Produce strict JSON only. Use conservative assumptions and never inflate high-grade odds when evidence is weak.`;

const USER_PROMPT = `Analyze these photos of the SAME RAW (unslabbed) sports trading card.

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

export async function POST(request: NextRequest) {
  let imageStats = buildImageStats([]);

  try {
    const body = await request.json();
    const imageUrls = extractImageUrls(body);

    if (imageUrls.length === 0) {
      return NextResponse.json(
        { error: "Missing image URL" },
        { status: 400 }
      );
    }

    if (imageUrls.length > 8) {
      return NextResponse.json(
        { error: "Too many images", reason: "Maximum 8 images allowed" },
        { status: 400 }
      );
    }

    let resolvedImages: Array<{
      base64Image: string;
      mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
      bytes: number;
    }> = [];

    try {
      const resolved = await resolveGradeEstimateImages(imageUrls);
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

    // Process card image for grade estimation
    const anthropic = getAnthropicClient();
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      messages: [
        {
          role: "user",
          content: [
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
    const parsed = parseGradeEstimateModelOutput({ modelText, imageStats });
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
