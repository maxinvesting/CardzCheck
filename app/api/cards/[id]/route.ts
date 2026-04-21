import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { CardImage } from "@/types";
import { getBusinessContextForUser } from "@/lib/business/context";
import { enqueueCertImageResolution } from "@/lib/images/cert-image-jobs";
import { normalizeCertWriteFields } from "@/lib/images/cert-image";
import { resolveTrustedCardImageForItem } from "@/lib/images/resolver";
import { syncTrustedImageFieldsForItem } from "@/lib/images/trusted-sync";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string | null | undefined): value is string {
  return typeof value === "string" && UUID_REGEX.test(value);
}

type BusinessInventoryLinkRow = {
  id: string;
  card_id: string | null;
  title: string | null;
  grade: string | null;
  grading_company: string | null;
  cert_number: string | null;
  psa_cert_number?: string | null;
  acquisition_type: string | null;
  acquisition_date: string | null;
  cost_basis_total_cents: number | null;
  image_url?: string | null;
  image_source?: "psa" | "bgs" | "sgc" | "cgc" | "user" | "none" | null;
  user_image_url: string | null;
  cert_image_status?: "queued" | "running" | "resolved" | "no_image" | "failed" | null;
  cert_image_last_error?: string | null;
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

    const businessContext = await getBusinessContextForUser(user.id);

    const fetchCollectionCardById = async (id: string) => {
      if (!isUuid(id)) return null;
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
        "id,card_id,title,grade,grading_company,cert_number,psa_cert_number,acquisition_type,acquisition_date,cost_basis_total_cents,image_url,image_source,user_image_url,cert_image_status,cert_image_last_error,notes,created_at,updated_at";

      let businessByIdQuery = supabase
        .from("business_inventory_items")
        .select(businessSelect)
        .eq("id", cardId);

      businessByIdQuery = businessContext
        ? businessByIdQuery.eq(
            "business_account_id",
            businessContext.businessAccountId
          )
        : businessByIdQuery.eq("user_id", user.id);

      const { data: businessById, error: businessByIdError } =
        await businessByIdQuery.maybeSingle();

      if (businessByIdError && businessByIdError.code !== "PGRST116") {
        throw businessByIdError;
      }

      let businessLink = businessById as BusinessInventoryLinkRow | null;

      if (!businessLink) {
        let businessByCardIdQuery = supabase
          .from("business_inventory_items")
          .select(businessSelect)
          .eq("card_id", cardId);

        businessByCardIdQuery = businessContext
          ? businessByCardIdQuery.eq(
              "business_account_id",
              businessContext.businessAccountId
            )
          : businessByCardIdQuery.eq("user_id", user.id);

        const { data: businessByCardIdRows, error: businessByCardIdError } =
          await businessByCardIdQuery
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

        resolvedCardId = isUuid(businessLink.card_id)
          ? businessLink.card_id
          : businessLink.id;
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
          psa_cert_number: businessLink.psa_cert_number ?? businessLink.cert_number,
          acquisition_type: businessLink.acquisition_type,
          purchase_price: purchasePrice,
          purchase_date: businessLink.acquisition_date,
          image_url: businessLink.image_url ?? null,
          image_source: businessLink.image_source ?? "none",
          user_image_url: businessLink.user_image_url,
          notes: businessLink.notes,
          created_at: businessLink.created_at,
          updated_at: businessLink.updated_at ?? businessLink.created_at,
        };
      }
    }

    if (!card) {
      return NextResponse.json({ error: "Card not found" }, { status: 404 });
    }

    const resolvedImage = await resolveTrustedCardImageForItem({
      supabase,
      item: card as any,
      itemId: resolvedCardId,
      userId: user.id,
    });

    const imagesWithUrls = resolvedImage.cardImages as CardImage[];

    return NextResponse.json({
      card: {
        ...card,
        trusted_image: resolvedImage.trustedImage,
        image_source: resolvedImage.imageSource,
        image_url: resolvedImage.imageUrl,
        psa_cert_number: resolvedImage.psaCertNumber,
        card_images: imagesWithUrls,
        primary_image: resolvedImage.primaryImage,
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
      "psa_cert_number",
      "acquisition_type",
      "purchase_price",
      "purchase_date",
      "notes",
      "image_url",
      "image_source",
      "user_image_url",
    ];

    const updates: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (field in body) {
        updates[field] = body[field];
      }
    }
    Object.assign(updates, normalizeCertWriteFields({
      grading_company: updates.grading_company,
      cert_number: updates.cert_number,
      psa_cert_number: updates.psa_cert_number,
    }));

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

    await syncTrustedImageFieldsForItem(cardId);
    await enqueueCertImageResolution({ itemId: cardId });

    const resolvedImage = await resolveTrustedCardImageForItem({
      supabase,
      item: updatedCard,
      itemId: cardId,
      userId: user.id,
    });

    return NextResponse.json({
      card: {
        ...updatedCard,
        trusted_image: resolvedImage.trustedImage,
        image_source: resolvedImage.imageSource,
        image_url: resolvedImage.imageUrl,
        psa_cert_number: resolvedImage.psaCertNumber,
        card_images: resolvedImage.cardImages,
        primary_image: resolvedImage.primaryImage,
      },
    });
  } catch (error) {
    console.error("Error in PATCH /api/cards/[id]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
