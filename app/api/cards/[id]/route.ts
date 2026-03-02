import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { CardImage } from "@/types";

type BusinessInventoryLinkRow = {
  id: string;
  card_id: string | null;
  title: string | null;
  grade: string | null;
  grading_company: string | null;
  cert_number: string | null;
  acquisition_type: string | null;
  acquisition_date: string | null;
  cost_basis_total_cents: number | null;
  user_image_url: string | null;
  stock_image_url: string | null;
  ebay_image_url: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string | null;
};

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

    const fetchCollectionCardById = async (id: string) => {
      const { data, error } = await supabase
        .from("collection_items")
        .select("*")
        .eq("id", id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (error && error.code !== "PGRST116") throw error;
      return data;
    };

    let card = await fetchCollectionCardById(cardId);
    let resolvedCardId = cardId;

    if (!card) {
      const businessSelect =
        "id,card_id,title,grade,grading_company,cert_number,acquisition_type,acquisition_date,cost_basis_total_cents,user_image_url,stock_image_url,ebay_image_url,notes,created_at,updated_at";

      const { data: businessById, error: businessByIdError } = await supabase
        .from("business_inventory_items")
        .select(businessSelect)
        .eq("id", cardId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (businessByIdError && businessByIdError.code !== "PGRST116") {
        throw businessByIdError;
      }

      let businessLink = businessById as BusinessInventoryLinkRow | null;

      if (!businessLink) {
        const { data: businessByCardIdRows, error: businessByCardIdError } =
          await supabase
            .from("business_inventory_items")
            .select(businessSelect)
            .eq("card_id", cardId)
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })
            .limit(1);

        if (businessByCardIdError) throw businessByCardIdError;
        businessLink = Array.isArray(businessByCardIdRows)
          ? ((businessByCardIdRows[0] as BusinessInventoryLinkRow | undefined) ?? null)
          : null;
      }

      if (businessLink?.card_id) {
        const linkedCard = await fetchCollectionCardById(businessLink.card_id);
        if (linkedCard) {
          card = linkedCard;
          resolvedCardId = businessLink.card_id;
        }
      }

      if (!card && businessLink?.title?.trim()) {
        const { data: titleMatchedRows, error: titleMatchError } = await supabase
          .from("collection_items")
          .select("*")
          .eq("user_id", user.id)
          .eq("title", businessLink.title.trim())
          .order("created_at", { ascending: false })
          .limit(1);

        if (titleMatchError) throw titleMatchError;
        const titleMatchedCard = Array.isArray(titleMatchedRows)
          ? titleMatchedRows[0]
          : null;
        if (titleMatchedCard) {
          card = titleMatchedCard;
          resolvedCardId = titleMatchedCard.id;
        }
      }

      if (!card && businessLink) {
        const purchasePrice =
          typeof businessLink.cost_basis_total_cents === "number"
            ? businessLink.cost_basis_total_cents / 100
            : null;

        resolvedCardId = businessLink.card_id || businessLink.id;
        card = {
          id: resolvedCardId,
          user_id: user.id,
          item_kind: "inventory",
          title: businessLink.title,
          player_name: businessLink.title || "Untitled",
          players: null,
          year: null,
          set_name: null,
          insert: null,
          grade: businessLink.grade,
          grading_company: businessLink.grading_company,
          cert_number: businessLink.cert_number,
          acquisition_type: businessLink.acquisition_type,
          purchase_price: purchasePrice,
          purchase_date: businessLink.acquisition_date,
          image_url: null,
          user_image_url: businessLink.user_image_url,
          stock_image_url: businessLink.stock_image_url,
          ebay_image_url: businessLink.ebay_image_url,
          notes: businessLink.notes,
          created_at: businessLink.created_at,
          updated_at: businessLink.updated_at ?? businessLink.created_at,
        };
      }
    }

    if (!card) {
      return NextResponse.json({ error: "Card not found" }, { status: 404 });
    }

    // Fetch all images for this card
    const { data: images } = await supabase
      .from("card_images")
      .select("*")
      .eq("card_id", resolvedCardId)
      .order("position", { ascending: true });

    const resolveImageUrl = (path: string | null | undefined): string | null => {
      if (!path) return null;
      if (path.startsWith("http")) return path;
      return supabase.storage.from("card-images").getPublicUrl(path).data.publicUrl;
    };

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
      if (typeof (card as { user_image_url?: string }).user_image_url === "string") {
        legacyUrls.add((card as { user_image_url?: string }).user_image_url as string);
      }
      if (typeof (card as { stock_image_url?: string }).stock_image_url === "string") {
        legacyUrls.add((card as { stock_image_url?: string }).stock_image_url as string);
      }
      if (typeof (card as { ebay_image_url?: string }).ebay_image_url === "string") {
        legacyUrls.add((card as { ebay_image_url?: string }).ebay_image_url as string);
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
        card_id: resolvedCardId,
        user_id: user.id,
        storage_path: url,
        position: index,
        created_at: card.created_at ?? new Date().toISOString(),
        url,
      }));
    }

    return NextResponse.json({
      card: {
        ...card,
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
      "acquisition_type",
      "purchase_price",
      "purchase_date",
      "image_url",
      "user_image_url",
      "stock_image_url",
      "ebay_image_url",
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
