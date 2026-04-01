import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { resolveGradeEstimateImages } from "@/lib/grading/gradeEstimateImages";
import { parseGradeEstimateModelOutput } from "@/lib/grading/gradeEstimateModel";
import { buildCategoryPromptNote, resolveGradingCategory } from "@/lib/grading/grading-profile";
import type { GradeScanCardMeta } from "@/lib/grading/gradeFeatures";
import type { ShopListingGradeAnalysis } from "@/types/shop";
import type { GradeScanPhoto } from "@/types";

const SYSTEM_PROMPT = `You are an expert trading card grading specialist. Handle sports cards and TCG cards (including Pokemon and One Piece). Produce strict JSON only.\n\nGrade the CARD, not the photo. Photo quality issues should affect confidence_label and confidence_score only — not the grade range or probabilities.`;

const USER_PROMPT = `Analyze these photos of the SAME RAW (unslabbed) trading card.

Grading weighting rubric:
- Centering: 40% (primary gate)
- Surface: 30%
- Corners: 15%
- Edges: 15%

Centering gate rules:
- Worse than 60/40 on either axis: PSA 10 must be very unlikely.
- Worse than 65/35 on either axis: PSA 9 must be unlikely.

Output ONLY valid JSON with this exact schema:
{
  "status": "ok" | "low_confidence" | "unable",
  "reason": "short reason",
  "estimated_grade_low": 0,
  "estimated_grade_high": 0,
  "grade_notes": "short synthesis",
  "confidence": {
    "overall_confidence_score": 0,
    "confidence_label": "high" | "medium" | "low",
    "limiting_factors": ["..."]
  },
  "centering": {
    "left_right_ratio": "55/45",
    "top_bottom_ratio": "52/48",
    "centering_severity_0_3": 0,
    "centering_notes": "..."
  },
  "surface": "short summary",
  "corners": "short summary",
  "edges": "short summary",
  "probabilities": [
    { "label": "PSA 10", "probability": 0.0 },
    { "label": "PSA 9", "probability": 0.0 },
    { "label": "PSA 8", "probability": 0.0 },
    { "label": "PSA 7 or lower", "probability": 0.0 }
  ]
}

Probabilities must sum to 1.0. Be conservative when evidence is weak.`;

function isRawCard(grade: string | null, condition: string | null): boolean {
  if (condition === "raw") return true;
  const g = (grade ?? "").toLowerCase();
  return g === "" || g.includes("raw") || g.includes("ungraded");
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const supabase = await createClient();

    const { data: listing, error } = await supabase
      .from("shop_listings")
      .select(
        "id,player_name,year,set_brand,sport,grade,condition,image_urls,thumbnail_url,grade_analysis,grade_analysis_at"
      )
      .eq("id", id)
      .eq("status", "active")
      .eq("publish_state", "published")
      .single();

    if (error || !listing) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    if (!isRawCard(listing.grade, listing.condition)) {
      return NextResponse.json(
        { error: "Grade analysis is only available for raw/ungraded cards" },
        { status: 400 }
      );
    }

    // Return cached result (no TTL — raw card condition doesn't change)
    if (listing.grade_analysis) {
      return NextResponse.json({ analysis: listing.grade_analysis, cached: true });
    }

    const imageUrls: string[] = listing.image_urls ?? [];
    if (imageUrls.length < 2) {
      return NextResponse.json(
        { error: "At least 2 images (front and back) are required for grade analysis" },
        { status: 400 }
      );
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "AI service not configured" },
        { status: 503 }
      );
    }

    // Build scan photos: first = front, second = back, rest = surface closeups
    const scanPhotos: GradeScanPhoto[] = imageUrls.slice(0, 5).map((url, i) => ({
      url,
      kind: i === 0 ? "front" : i === 1 ? "back" : "surface",
      sort_order: i,
    }));

    const { resolvedImages, imageStats } = await resolveGradeEstimateImages(scanPhotos);

    if (resolvedImages.length === 0) {
      return NextResponse.json(
        { error: "Could not load card images" },
        { status: 500 }
      );
    }

    // Build image content blocks
    const imageBlocks = resolvedImages.map((img) => ({
      type: "image" as const,
      source: {
        type: "base64" as const,
        media_type: img.mediaType as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
        data: img.base64Image,
      },
    }));

    // Category note for TCG cards
    const category = resolveGradingCategory({
      game: null,
      sport: listing.sport ?? null,
      player_name: listing.player_name ?? null,
      set_name: listing.set_brand ?? null,
      year: listing.year ?? null,
      title: null,
    });
    const categoryNote = buildCategoryPromptNote(category);
    const userPrompt = categoryNote ? `${USER_PROMPT}\n\n${categoryNote}` : USER_PROMPT;

    const anthropic = new Anthropic({ apiKey });
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            ...imageBlocks,
            { type: "text", text: userPrompt },
          ],
        },
      ],
    });

    const rawText = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");

    const cardMeta: GradeScanCardMeta = {
      game: null,
      sport: listing.sport ?? null,
      player_name: listing.player_name ?? null,
      set_name: listing.set_brand ?? null,
      year: listing.year ?? null,
      title: null,
    };

    const parsed = await parseGradeEstimateModelOutput({
      modelText: rawText,
      imageStats,
      scanPhotoKinds: scanPhotos.map((p) => p.kind),
      cardMeta,
    });

    if (!parsed || parsed.estimate.analysis_status === "unable") {
      return NextResponse.json(
        { error: "Could not analyze card — insufficient image quality" },
        { status: 422 }
      );
    }

    const est = parsed.estimate;
    const probabilities = (parsed.probabilities ?? []).map((p) => ({
      label: p.label,
      probability: p.probability,
    }));

    const analysis: ShopListingGradeAnalysis = {
      status: (est.analysis_status ?? "low_confidence") as "ok" | "low_confidence" | "unable",
      estimated_grade_low: est.estimated_grade_low,
      estimated_grade_high: est.estimated_grade_high,
      grade_notes: est.grade_notes,
      confidence: {
        overall_confidence_score: est.confidence?.overall_confidence_score ?? 0,
        confidence_label: (est.confidence?.confidence_label ?? "low") as "high" | "medium" | "low",
        limiting_factors: est.confidence?.limiting_factors ?? [],
      },
      centering: {
        left_right_ratio: est.centering_detail?.left_right_ratio ?? "—",
        top_bottom_ratio: est.centering_detail?.top_bottom_ratio ?? "—",
        centering_severity_0_3: est.centering_detail?.centering_severity_0_3 ?? 0,
        centering_notes: est.centering_detail?.centering_notes ?? "",
      },
      surface: est.surface ?? "",
      corners: est.corners ?? "",
      edges: est.edges ?? "",
      probabilities,
      analyzed_image_url: imageUrls[0] ?? null,
    };

    // Cache permanently (fire and forget)
    createServiceClient()
      .then((svc) =>
        svc
          .from("shop_listings")
          .update({ grade_analysis: analysis, grade_analysis_at: new Date().toISOString() })
          .eq("id", id)
          .then(({ error: updateError }) => {
            if (updateError) console.error("Failed to cache grade_analysis:", updateError);
          })
      )
      .catch((err) => console.error("grade_analysis cache write skipped:", err));

    return NextResponse.json({ analysis, cached: false });
  } catch (err) {
    console.error("grade-analysis route error:", err);
    return NextResponse.json(
      { error: "Failed to analyze card" },
      { status: 500 }
    );
  }
}
