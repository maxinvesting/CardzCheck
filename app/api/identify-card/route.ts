import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

// Server-side upload validation constants
const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const ALLOWED_URL_HOSTS = [
  // Supabase storage
  "supabase.co",
  "supabase.in",
  // Add your specific Supabase project URL domain if needed
];

function getAnthropicClient() {
  return new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });
}

/**
 * Validate base64 image data
 * Returns { valid: true, size, mimeType } or { valid: false, error }
 */
function validateBase64Image(dataUrl: string): {
  valid: boolean;
  size?: number;
  mimeType?: string;
  base64Data?: string;
  error?: string;
} {
  // Parse data URL format: data:image/jpeg;base64,/9j/4AAQ...
  const matches = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
  if (!matches) {
    return { valid: false, error: "Invalid base64 data URL format" };
  }

  const [, mimeType, base64Data] = matches;

  // Validate mime type
  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    return {
      valid: false,
      error: `Invalid image type: ${mimeType}. Allowed: ${ALLOWED_MIME_TYPES.join(", ")}`,
    };
  }

  // Calculate decoded size (base64 is ~4/3 of original size)
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
 * Validate image URL
 * Returns { valid: true } or { valid: false, error }
 */
function validateImageUrl(url: string): { valid: boolean; error?: string } {
  // Must be HTTPS
  if (!url.startsWith("https://")) {
    return { valid: false, error: "Image URL must use HTTPS" };
  }

  try {
    const parsedUrl = new URL(url);

    // Check if host is allowed (Supabase storage or similar trusted sources)
    const isAllowedHost = ALLOWED_URL_HOSTS.some(
      (host) =>
        parsedUrl.hostname === host || parsedUrl.hostname.endsWith(`.${host}`)
    );

    if (!isAllowedHost) {
      // For now, allow any HTTPS URL but log a warning
      // In production, you may want to restrict to known hosts only
      console.warn(
        `[identify-card] URL from untrusted host: ${parsedUrl.hostname}`
      );
    }

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
  // Validate content type
  const mimeType = contentType?.split(";")[0]?.trim();
  if (!mimeType || !ALLOWED_MIME_TYPES.includes(mimeType)) {
    return {
      valid: false,
      error: `Invalid image type from URL: ${mimeType || "unknown"}. Allowed: ${ALLOWED_MIME_TYPES.join(", ")}`,
    };
  }

  // Validate size if Content-Length header is present
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

const SYSTEM_PROMPT = `You are a sports trading card identification expert with deep knowledge of card sets, parallels, variants, and insert types. Your job is to identify cards from images with high accuracy, paying special attention to insert types (especially Downtown inserts), multi-player cards, parallel types, and variants.`;

const USER_PROMPT = `Identify this sports trading card from the image. Pay close attention to ALL details visible on the card.

CRITICAL - Downtown Insert Detection:
- Look for the word "Downtown" printed anywhere on the card (often vertically along edges or prominently displayed)
- Downtown inserts have distinctive cityscape/urban artwork backgrounds
- If "Downtown" is detected, this is an INSERT, not a parallel variant
- DO NOT assign parallel types like "Silver Holo" to Downtown inserts unless explicitly visible

CRITICAL - Multi-Player Detection:
- Look for multiple player names on the card
- Examples: "Bo Nix + John Elway", "Dual Downtowns", "Triple", etc.
- If multiple players are visible, extract ALL player names
- Set confidence to "medium" or "low" if uncertain about player identification

CRITICAL - Parallel/Variant Detection:
Look carefully for visual indicators of parallels:
- COLOR: Silver, Gold, Red, Blue, Green, Orange, Purple, Pink, Black, Neon Green
- FINISH: Refractor (rainbow/holographic), Shimmer, Cracked Ice, Mojo, Sepia, Camo, Tiger Stripe, Hyper, Wave, Holo, Stained Glass
- TEXT/LABELS: Look for words like "Silver Prizm", "Gold Prizm", "Refractor", "Shimmer", "Mojo", etc. printed on the card
- SERIAL NUMBERS: Look for numbered cards like "/99", "/49", "/25", "/10", "/5", "/1", or "1/1" printed on the card
- SPECIAL FEATURES: Autograph, Patch, Jersey, Rookie Card indicators
- BASE CARDS: If none of the above are visible, it's likely "Base"
- DO NOT assign parallel types to Downtown inserts unless explicitly visible

Extract these fields:
- player_name: Primary player name (if multiple players, use the first/main one, but also populate players array)
- players: Array of ALL player names found on the card (e.g., ["Bo Nix", "John Elway"] for dual player cards). If single player, use array with one element.
- year: Year printed on card (4 digits, not year of photo). Be careful - Downtown inserts may have different years than base sets.
- set_name: Card set/brand name (e.g., "Panini Prizm", "Topps Chrome", "Panini Select", "Fleer", "Bowman Chrome", "Donruss Optic")
- insert: Insert type if detected. Examples: "Downtown", "Kaboom", "Court Kings", "Immaculate", etc. If no insert, leave empty.
- variant: Parallel/variant type if visible (ONLY if not an insert). Use exact names like:
  * Color parallels: "Silver Prizm", "Gold Prizm", "Red Prizm", "Blue Prizm", "Green Prizm", "Orange Prizm", "Purple Prizm", "Black Prizm", "Pink", "Neon Green"
  * Finish types: "Refractor", "Shimmer", "Cracked Ice", "Mojo", "Sepia", "Camo", "Tiger Stripe", "Hyper", "Wave", "Holo", "Stained Glass"
  * Numbered: "/99", "/49", "/25", "/10", "/5", "/1", "1/1" (include the slash and number)
  * Special: "Autograph", "Auto Patch", "Jersey", "Patch", "Rookie Card"
  * If none detected and not an insert: "Base"
- grade: If slabbed/graded, include grader and grade (e.g., "PSA 10", "BGS 9.5", "SGC 9", "CGC 9.5"). If raw/ungraded, leave empty.
- confidence: Your confidence level (high/medium/low). Use "low" if:
  * Multiple players detected but uncertain about all names
  * Downtown insert detected but year/set uncertain
  * Any ambiguity in identification

IMPORTANT:
- If "Downtown" is detected, set insert: "Downtown" and DO NOT assign variant unless explicitly visible
- If multiple players detected, populate players array with all names
- Be conservative with confidence - use "low" or "medium" when uncertain
- If you cannot clearly identify the card, set confidence to "low"

Return ONLY valid JSON with this structure:
{
  "player_name": "",
  "players": [""],
  "year": "",
  "set_name": "",
  "insert": "",
  "variant": "",
  "grade": "",
  "confidence": ""
}

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

    // Validate input type
    if (typeof imageUrl !== "string") {
      return NextResponse.json(
        { error: "Invalid input", reason: "imageUrl must be a string" },
        { status: 400 }
      );
    }

    let base64Image: string;
    let mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp";

    // Check if imageUrl is a base64 data URL (fallback from storage failure)
    if (imageUrl.startsWith("data:image/")) {
      // Validate base64 image
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

      // Validate fetched image headers
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

      // Double-check size after download (in case Content-Length was missing)
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

      // Determine media type
      mediaType = (contentType?.split(";")[0] || "image/jpeg") as "image/jpeg" | "image/png" | "image/gif" | "image/webp";
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
      // Ensure players is always an array (backward compatibility)
      if (result.player_name && !result.players) {
        result.players = [result.player_name];
      }
      // Remove gradeEstimate - identification only, no grading
      delete result.gradeEstimate;
      return NextResponse.json(result);
    } catch {
      // If parsing fails, try to extract JSON from the response
      const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const result = JSON.parse(jsonMatch[0]);
          // Ensure players is always an array
          if (result.player_name && !result.players) {
            result.players = [result.player_name];
          }
          // Remove gradeEstimate
          delete result.gradeEstimate;
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
