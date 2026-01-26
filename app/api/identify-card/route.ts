import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

function getAnthropicClient() {
  return new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });
}

const SYSTEM_PROMPT = `You are a sports trading card identification expert with deep knowledge of card sets, parallels, variants, and grading. Your job is to identify cards from images with high accuracy, paying special attention to parallel types and variants. You also have expertise in evaluating card condition for grading purposes.`;

const USER_PROMPT = `Identify this sports trading card from the image and estimate its condition/grade. Pay close attention to ALL details visible on the card.

PART 1 - CARD IDENTIFICATION

CRITICAL - Parallel/Variant Detection:
Look carefully for visual indicators of parallels:
- COLOR: Silver, Gold, Red, Blue, Green, Orange, Purple, Pink, Black, Neon Green
- FINISH: Refractor (rainbow/holographic), Shimmer, Cracked Ice, Mojo, Sepia, Camo, Tiger Stripe, Hyper, Wave, Holo, Stained Glass
- TEXT/LABELS: Look for words like "Silver Prizm", "Gold Prizm", "Refractor", "Shimmer", "Mojo", etc. printed on the card
- SERIAL NUMBERS: Look for numbered cards like "/99", "/49", "/25", "/10", "/5", "/1", or "1/1" printed on the card
- SPECIAL FEATURES: Autograph, Patch, Jersey, Rookie Card indicators
- BASE CARDS: If none of the above are visible, it's likely "Base"

Extract these fields:
- player_name: Full name of the athlete (exact spelling from card)
- year: Year printed on card (4 digits, not year of photo)
- set_name: Card set/brand name (e.g., "Panini Prizm", "Topps Chrome", "Panini Select", "Fleer", "Bowman Chrome")
- variant: Parallel/variant type if visible. Use exact names like:
  * Color parallels: "Silver Prizm", "Gold Prizm", "Red Prizm", "Blue Prizm", "Green Prizm", "Orange Prizm", "Purple Prizm", "Black Prizm", "Pink", "Neon Green"
  * Finish types: "Refractor", "Shimmer", "Cracked Ice", "Mojo", "Sepia", "Camo", "Tiger Stripe", "Hyper", "Wave", "Holo", "Stained Glass"
  * Numbered: "/99", "/49", "/25", "/10", "/5", "/1", "1/1" (include the slash and number)
  * Special: "Autograph", "Auto Patch", "Jersey", "Patch", "Rookie Card"
  * If none detected: "Base"
- grade: If slabbed/graded, include grader and grade (e.g., "PSA 10", "BGS 9.5", "SGC 9", "CGC 9.5"). If raw/ungraded, leave empty.
- confidence: Your confidence level (high/medium/low)

PART 2 - GRADE ESTIMATION

If the card is RAW (not already in a slab), analyze its physical condition:

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

IMPORTANT for grade estimation:
- Be conservative - it's better to underestimate than overestimate
- Photo quality affects accuracy - note if image quality limits your assessment
- If the card is already graded (in a slab), set gradeEstimate to null
- Give a range (e.g., 7-9) to reflect uncertainty

Return ONLY valid JSON with this structure:
{
  "player_name": "",
  "year": "",
  "set_name": "",
  "variant": "",
  "grade": "",
  "confidence": "",
  "gradeEstimate": {
    "estimated_grade_low": 0,
    "estimated_grade_high": 0,
    "centering": "",
    "corners": "",
    "surface": "",
    "edges": "",
    "grade_notes": ""
  }
}

If the card is already graded (in a slab), set gradeEstimate to null.

If you cannot identify the card, return:
{"error": "Could not identify card", "reason": "brief explanation"}`;

export async function POST(request: NextRequest) {
  try {
    const { imageUrl } = await request.json();

    if (!imageUrl) {
      return NextResponse.json(
        { error: "Missing image URL" },
        { status: 400 }
      );
    }

    let base64Image: string;
    let mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp";

    // Check if imageUrl is a base64 data URL (fallback from storage failure)
    if (imageUrl.startsWith("data:image/")) {
      const matches = imageUrl.match(/^data:image\/(\w+);base64,(.+)$/);
      if (matches) {
        const [, format, base64] = matches;
        base64Image = base64;
        mediaType = `image/${format}` as "image/jpeg" | "image/png" | "image/gif" | "image/webp";
      } else {
        return NextResponse.json(
          { error: "Invalid image format", reason: "Could not parse base64 image" },
          { status: 400 }
        );
      }
    } else {
      // Fetch image from URL and convert to base64
      const imageResponse = await fetch(imageUrl);
      if (!imageResponse.ok) {
        return NextResponse.json(
          { error: "Could not fetch image", reason: "Image URL is not accessible" },
          { status: 400 }
        );
      }

      const imageBuffer = await imageResponse.arrayBuffer();
      base64Image = Buffer.from(imageBuffer).toString("base64");

      // Determine media type
      const contentType = imageResponse.headers.get("content-type") || "image/jpeg";
      mediaType = contentType.split(";")[0] as "image/jpeg" | "image/png" | "image/gif" | "image/webp";
    }

    // Process card image
    const anthropic = getAnthropicClient();
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType,
                data: base64Image,
              },
            },
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
    if (!textContent || textContent.type !== "text") {
      return NextResponse.json(
        { error: "No response from identification service", reason: "Empty response" },
        { status: 500 }
      );
    }

    // Parse JSON response
    try {
      const result = JSON.parse(textContent.text);
      return NextResponse.json(result);
    } catch {
      // If parsing fails, try to extract JSON from the response
      const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const result = JSON.parse(jsonMatch[0]);
          return NextResponse.json(result);
        } catch {
          // Fall through to error
        }
      }
      return NextResponse.json(
        { error: "Could not parse response", reason: "Invalid JSON in response" },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Card identification error:", error);
    return NextResponse.json(
      { error: "Failed to identify card", reason: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
