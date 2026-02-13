import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { CardImage } from "@/types";
import {
  pickFirstHttpsImageUrl,
  resolveStoredCardImageUrl,
} from "@/lib/collection/image-url";

// GET /api/cards/[id] - Fetch a single card with all images
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id: cardId } = await context.params;

  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch card
    const { data: card, error: cardError } = await supabase
      .from("collection_items")
      .select("*")
      .eq("id", cardId)
      .eq("user_id", user.id)
      .single();

    if (cardError || !card) {
      return NextResponse.json(
        { error: "Card not found" },
        { status: 404 }
      );
    }

    // Fetch all images for this card
    const { data: images } = await supabase
      .from("card_images")
      .select("*")
      .eq("card_id", cardId)
      .order("position", { ascending: true });

    const resolveImageUrl = (path: string | null | undefined): string | null =>
      resolveStoredCardImageUrl(supabase, path);

    // Generate public URLs
    let imagesWithUrls = (images || []).map((img: CardImage) => ({
      ...img,
      url: resolveImageUrl(img.storage_path) ?? undefined,
    }));

    if (imagesWithUrls.length === 0) {
      const legacyUrls = new Set<string>();
      if (typeof (card as { image_url?: string }).image_url === "string") {
        legacyUrls.add((card as { image_url?: string }).image_url as string);
      }
      const extraUrls = (card as { image_urls?: string[] }).image_urls;
      if (Array.isArray(extraUrls)) {
        extraUrls.forEach((url) => {
          if (typeof url === "string" && url.length > 0) {
            legacyUrls.add(url);
          }
        });
      }

      imagesWithUrls = Array.from(legacyUrls).map((url, index) => ({
        id: `legacy-${index}`,
        card_id: cardId,
        user_id: user.id,
        storage_path: url,
        position: index,
        created_at: card.created_at ?? new Date().toISOString(),
        url,
      }));
    }

    const thumbnailUrl = pickFirstHttpsImageUrl([
      (card as { thumbnail_url?: string | null }).thumbnail_url ?? null,
      imagesWithUrls[0]?.url ?? null,
      (card as { image_url?: string | null }).image_url ?? null,
    ]);

    return NextResponse.json({
      card: {
        ...card,
        thumbnail_url: thumbnailUrl,
        card_images: imagesWithUrls,
        primary_image: imagesWithUrls.find((img: CardImage) => img.position === 0) || imagesWithUrls[0],
      },
    });
  } catch (error) {
    console.error("Error in GET /api/cards/[id]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// PATCH /api/cards/[id] - Update card details
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id: cardId } = await context.params;

  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();

    // Only allow updating specific fields
    const allowedFields = [
      "player_name",
      "players",
      "year",
      "set_name",
      "insert",
      "grade",
      "grading_company",
      "cert_number",
      "purchase_price",
      "purchase_date",
      "notes",
    ];

    const updates: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (field in body) {
        updates[field] = body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    // Update the card
    const { data: updatedCard, error: updateError } = await supabase
      .from("collection_items")
      .update(updates)
      .eq("id", cardId)
      .eq("user_id", user.id)
      .select()
      .single();

    if (updateError) {
      console.error("Error updating card:", updateError);
      return NextResponse.json(
        { error: "Failed to update card" },
        { status: 500 }
      );
    }

    return NextResponse.json({ card: updatedCard });
  } catch (error) {
    console.error("Error in PATCH /api/cards/[id]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
