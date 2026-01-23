import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

function getAnthropicClient() {
  return new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });
}

const SYSTEM_PROMPT = `You are a sports trading card identification expert. Your job is to identify cards from images with high accuracy.`;

const USER_PROMPT = `Identify this sports trading card. Extract:
- player_name: Full name of the athlete
- year: Year printed on card (not year of photo)
- set_name: Card set/brand (e.g., "Topps Chrome", "Panini Prizm")
- variant: Parallel or variant if visible (e.g., "Silver", "Refractor", "Base")
- grade: If slabbed, the grade and grader (e.g., "PSA 10", "BGS 9.5")
- confidence: Your confidence level (high/medium/low)

Return ONLY valid JSON, no explanation:
{"player_name": "", "year": "", "set_name": "", "variant": "", "grade": "", "confidence": ""}

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

    // Fetch image and convert to base64
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      return NextResponse.json(
        { error: "Could not fetch image", reason: "Image URL is not accessible" },
        { status: 400 }
      );
    }

    const imageBuffer = await imageResponse.arrayBuffer();
    const base64Image = Buffer.from(imageBuffer).toString("base64");

    // Determine media type
    const contentType = imageResponse.headers.get("content-type") || "image/jpeg";
    const mediaType = contentType.split(";")[0] as "image/jpeg" | "image/png" | "image/gif" | "image/webp";

    // Identify card from image
    const anthropic = getAnthropicClient();
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
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
