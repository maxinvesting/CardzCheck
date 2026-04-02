import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { CardImage } from "@/types";
import { MAX_CARD_IMAGE_UPLOAD_BYTES, optimizeUploadedCardImage } from "@/lib/images/uploads";
import {
  ensureCanonicalCollectionItemForBusinessItem,
  syncTrustedImageFieldsForItem,
} from "@/lib/images/trusted-sync";
import { resolveStoredImagePath, sortCardImages } from "@/lib/images/shared";

type UploadSpec = {
  file: File;
  label: "front" | "back";
};

async function getAuthedUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return { supabase, user: null as null };
  }

  return { supabase, user };
}

async function resolveCanonicalCardId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  requestedId: string,
  userId: string
): Promise<string | null> {
  const { data: directCollectionCard } = await supabase
    .from("collection_items")
    .select("id")
    .eq("id", requestedId)
    .eq("user_id", userId)
    .maybeSingle();

  if (directCollectionCard?.id) return directCollectionCard.id;

  const canonicalId = await ensureCanonicalCollectionItemForBusinessItem(requestedId);
  if (!canonicalId) return null;

  const { data: canonicalCollectionCard } = await supabase
    .from("collection_items")
    .select("id")
    .eq("id", canonicalId)
    .eq("user_id", userId)
    .maybeSingle();

  return canonicalCollectionCard?.id ?? null;
}

function serializeImages(
  supabase: Awaited<ReturnType<typeof createClient>>,
  images: CardImage[]
) {
  return sortCardImages(images).map((image) => ({
    ...image,
    url:
      resolveStoredImagePath(
        image.storage_path,
        (path) => supabase.storage.from("card-images").getPublicUrl(path).data.publicUrl
      ) ?? undefined,
  }));
}

function parseUploadSpecs(formData: FormData): UploadSpec[] {
  const specs: UploadSpec[] = [];
  const pushIfFile = (entry: FormDataEntryValue | null, label: "front" | "back") => {
    if (entry instanceof File && entry.size > 0) {
      specs.push({ file: entry, label });
    }
  };

  pushIfFile(formData.get("front"), "front");
  pushIfFile(formData.get("back"), "back");

  if (specs.length === 0) {
    const files = formData
      .getAll("files")
      .filter((entry): entry is File => entry instanceof File && entry.size > 0);
    files.slice(0, 2).forEach((file, index) => {
      specs.push({ file, label: index === 0 ? "front" : "back" });
    });
  }

  return specs;
}

async function fetchCardImages(
  supabase: Awaited<ReturnType<typeof createClient>>,
  cardId: string,
  userId: string
) {
  const { data } = await supabase
    .from("card_images")
    .select("*")
    .eq("card_id", cardId)
    .eq("user_id", userId)
    .order("position", { ascending: true });

  return (data ?? []) as CardImage[];
}

async function normalizePositions(
  supabase: Awaited<ReturnType<typeof createClient>>,
  images: CardImage[]
) {
  const ordered = sortCardImages(images);
  await Promise.all(
    ordered.map((image, index) =>
      supabase
        .from("card_images")
        .update({
          position: index,
          label: index === 0 ? "front" : index === 1 ? "back" : image.label,
        })
        .eq("id", image.id)
    )
  );
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  try {
    const { supabase, user } = await getAuthedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const cardId = await resolveCanonicalCardId(supabase, id, user.id);
    if (!cardId) {
      return NextResponse.json({ error: "Card not found or access denied" }, { status: 404 });
    }

    const images = await fetchCardImages(supabase, cardId, user.id);
    return NextResponse.json({ images: serializeImages(supabase, images), cardId });
  } catch (error) {
    console.error("Error in GET /api/cards/[id]/images:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  try {
    const { supabase, user } = await getAuthedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const cardId = await resolveCanonicalCardId(supabase, id, user.id);
    if (!cardId) {
      return NextResponse.json({ error: "Card not found or access denied" }, { status: 404 });
    }

    const formData = await request.formData();
    const uploadSpecs = parseUploadSpecs(formData);

    if (uploadSpecs.length === 0) {
      return NextResponse.json({ error: "No files provided" }, { status: 400 });
    }

    for (const spec of uploadSpecs) {
      if (!spec.file.type.startsWith("image/")) {
        return NextResponse.json({ error: "Only image uploads are allowed" }, { status: 400 });
      }
      if (spec.file.size > MAX_CARD_IMAGE_UPLOAD_BYTES) {
        return NextResponse.json(
          { error: "Each image must be 10MB or smaller" },
          { status: 400 }
        );
      }
    }

    const existingImages = await fetchCardImages(supabase, cardId, user.id);

    for (const spec of uploadSpecs) {
      const existingForLabel = existingImages.filter((image) => image.label === spec.label);

      for (const image of existingForLabel) {
        await supabase.storage.from("card-images").remove([image.storage_path]);
        await supabase.from("card_images").delete().eq("id", image.id).eq("user_id", user.id);
      }

      const optimized = await optimizeUploadedCardImage(spec.file);
      const storagePath = `${user.id}/${cardId}/${spec.label}-${crypto.randomUUID()}.${optimized.extension}`;

      const { error: uploadError } = await supabase.storage
        .from("card-images")
        .upload(storagePath, optimized.buffer, {
          contentType: optimized.contentType,
          upsert: false,
        });

      if (uploadError) {
        throw uploadError;
      }

      const targetPosition = spec.label === "front" ? 0 : 1;
      const { error: insertError } = await supabase
        .from("card_images")
        .insert({
          card_id: cardId,
          user_id: user.id,
          storage_path: storagePath,
          position: targetPosition,
          label: spec.label,
        });

      if (insertError) {
        await supabase.storage.from("card-images").remove([storagePath]);
        throw insertError;
      }
    }

    const freshImages = await fetchCardImages(supabase, cardId, user.id);
    await normalizePositions(supabase, freshImages);
    await syncTrustedImageFieldsForItem(cardId);

    const normalizedImages = await fetchCardImages(supabase, cardId, user.id);
    return NextResponse.json({
      cardId,
      images: serializeImages(supabase, normalizedImages),
    });
  } catch (error) {
    console.error("Error in POST /api/cards/[id]/images:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  try {
    const { supabase, user } = await getAuthedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const cardId = await resolveCanonicalCardId(supabase, id, user.id);
    if (!cardId) {
      return NextResponse.json({ error: "Card not found or access denied" }, { status: 404 });
    }

    const imageId = request.nextUrl.searchParams.get("imageId");
    if (!imageId) {
      return NextResponse.json({ error: "Image ID required" }, { status: 400 });
    }

    const { data: image, error } = await supabase
      .from("card_images")
      .select("*")
      .eq("id", imageId)
      .eq("card_id", cardId)
      .eq("user_id", user.id)
      .single();

    if (error || !image) {
      return NextResponse.json({ error: "Image not found or access denied" }, { status: 404 });
    }

    await supabase.storage.from("card-images").remove([image.storage_path]);
    await supabase.from("card_images").delete().eq("id", imageId).eq("user_id", user.id);

    const remainingImages = await fetchCardImages(supabase, cardId, user.id);
    await normalizePositions(supabase, remainingImages);
    await syncTrustedImageFieldsForItem(cardId);

    const normalizedImages = await fetchCardImages(supabase, cardId, user.id);
    return NextResponse.json({
      success: true,
      cardId,
      images: serializeImages(supabase, normalizedImages),
    });
  } catch (error) {
    console.error("Error in DELETE /api/cards/[id]/images:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  try {
    const { supabase, user } = await getAuthedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const cardId = await resolveCanonicalCardId(supabase, id, user.id);
    if (!cardId) {
      return NextResponse.json({ error: "Card not found or access denied" }, { status: 404 });
    }

    const body = await request.json();
    const imageOrders = Array.isArray(body?.imageOrders) ? body.imageOrders : [];

    if (imageOrders.length === 0) {
      return NextResponse.json({ error: "Invalid image orders" }, { status: 400 });
    }

    await Promise.all(
      imageOrders.map((entry: { id?: string; position?: number; label?: string }) => {
        const position = Number.isFinite(entry.position) ? Number(entry.position) : 0;
        const label =
          entry.label === "front" || entry.label === "back"
            ? entry.label
            : position === 0
            ? "front"
            : position === 1
            ? "back"
            : null;

        return supabase
          .from("card_images")
          .update({ position, label })
          .eq("id", entry.id)
          .eq("card_id", cardId)
          .eq("user_id", user.id);
      })
    );

    const images = await fetchCardImages(supabase, cardId, user.id);
    await normalizePositions(supabase, images);
    await syncTrustedImageFieldsForItem(cardId);

    const normalizedImages = await fetchCardImages(supabase, cardId, user.id);
    return NextResponse.json({
      cardId,
      images: serializeImages(supabase, normalizedImages),
    });
  } catch (error) {
    console.error("Error in PATCH /api/cards/[id]/images:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
