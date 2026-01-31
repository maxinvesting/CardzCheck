import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

// Server-side upload validation constants
const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

function getAnthropicClient() {
  return new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });
}

/**
 * Validate base64 image data
 */
function validateBase64Image(dataUrl: string): {
  valid: boolean;
  size?: number;
  mimeType?: string;
  base64Data?: string;
  error?: string;
} {
  const matches = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
  if (!matches) {
    return { valid: false, error: "Invalid base64 data URL format" };
  }

  const [, mimeType, base64Data] = matches;

  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    return {
      valid: false,
      error: `Invalid image type: ${mimeType}. Allowed: ${ALLOWED_MIME_TYPES.join(", ")}`,
    };
  }

  const decodedSize = Math.ceil((base64Data.length * 3) / 4);
  if (decodedSize > MAX_IMAGE_SIZE_BYTES) {
    return {
      valid: false,
      error: `Image too large: ${(decodedSize / 1024 / 1024).toFixed(1)}MB. Maximum: 10MB`,
    };
  }

  return { valid: true, size: decodedSize, mimeType, base64Data };
}

/**
 * Validate image URL (must be HTTPS)
 */
function validateImageUrl(url: string): { valid: boolean; error?: string } {
  if (!url.startsWith("https://")) {
    return { valid: false, error: "Image URL must use HTTPS" };
  }
  try {
    new URL(url);
    return { valid: true };
  } catch {
    return { valid: false, error: "Invalid URL format" };
  }
}

/**
 * Validate fetched image response
 */
function validateFetchedImage(
  contentType: string | null,
  contentLength: string | null
): { valid: boolean; error?: string } {
  const mimeType = contentType?.split(";")[0]?.trim();
  if (!mimeType || !ALLOWED_MIME_TYPES.includes(mimeType)) {
    return {
      valid: false,
      error: `Invalid image type: ${mimeType || "unknown"}. Allowed: ${ALLOWED_MIME_TYPES.join(", ")}`,
    };
  }

  if (contentLength) {
    const size = parseInt(contentLength, 10);
    if (!isNaN(size) && size > MAX_IMAGE_SIZE_BYTES) {
      return {
        valid: false,
        error: `Image too large: ${(size / 1024 / 1024).toFixed(1)}MB. Maximum: 10MB`,
      };
    }
  }

  return { valid: true };
}

const SYSTEM_PROMPT = `You are a sports trading card grading expert with deep knowledge of PSA, BGS, SGC, and CGC grading standards. Your job is to analyze card condition and estimate grades based on centering, corners, surface, and edges.`;

const USER_PROMPT = `Analyze this sports trading card image and estimate its condition/grade. The card is RAW (not already in a slab).

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

Return ONLY valid JSON with this structure:
{
  "estimated_grade_low": 0,
  "estimated_grade_high": 0,
  "centering": "",
  "corners": "",
  "surface": "",
  "edges": "",
  "grade_notes": ""
}`;

export async function POST(request: NextRequest) {
  try {
    const { imageUrl } = await request.json();

    if (!imageUrl) {
      return NextResponse.json(
        { error: "Missing image URL" },
        { status: 400 }
      );
    }

    if (typeof imageUrl !== "string") {
      return NextResponse.json(
        { error: "Invalid input", reason: "imageUrl must be a string" },
        { status: 400 }
      );
    }

    let base64Image: string;
    let mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp";

    // Check if imageUrl is a base64 data URL
    if (imageUrl.startsWith("data:image/")) {
      const validation = validateBase64Image(imageUrl);
      if (!validation.valid) {
        return NextResponse.json(
          { error: "Invalid image", reason: validation.error },
          { status: 400 }
        );
      }

      base64Image = validation.base64Data!;
      mediaType = validation.mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp";
    } else {
      // Validate URL before fetching
      const urlValidation = validateImageUrl(imageUrl);
      if (!urlValidation.valid) {
        return NextResponse.json(
          { error: "Invalid image URL", reason: urlValidation.error },
          { status: 400 }
        );
      }

      // Fetch image from URL and convert to base64
      const imageResponse = await fetch(imageUrl);
      if (!imageResponse.ok) {
        return NextResponse.json(
          { error: "Could not fetch image", reason: "Image URL is not accessible" },
          { status: 400 }
        );
      }

      // Validate fetched image
      const contentType = imageResponse.headers.get("content-type");
      const contentLength = imageResponse.headers.get("content-length");
      const fetchValidation = validateFetchedImage(contentType, contentLength);
      if (!fetchValidation.valid) {
        return NextResponse.json(
          { error: "Invalid image", reason: fetchValidation.error },
          { status: 400 }
        );
      }

      const imageBuffer = await imageResponse.arrayBuffer();

      // Check size after download
      if (imageBuffer.byteLength > MAX_IMAGE_SIZE_BYTES) {
        return NextResponse.json(
          {
            error: "Image too large",
            reason: `Image is ${(imageBuffer.byteLength / 1024 / 1024).toFixed(1)}MB. Maximum: 10MB`,
          },
          { status: 400 }
        );
      }

      base64Image = Buffer.from(imageBuffer).toString("base64");
      mediaType = (contentType?.split(";")[0] || "image/jpeg") as "image/jpeg" | "image/png" | "image/gif" | "image/webp";
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
        { error: "No response from grade estimation service", reason: "Empty response" },
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
    console.error("Grade estimation error:", error);
    return NextResponse.json(
      { error: "Failed to estimate grade", reason: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
