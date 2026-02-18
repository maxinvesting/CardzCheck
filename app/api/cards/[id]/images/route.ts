import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { CardImage } from "@/types";

// GET /api/cards/[id]/images - Fetch all images for a card
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

    // Fetch card images ordered by position
    const { data: images, error: fetchError } = await supabase
      .from("card_images")
      .select("*")
      .eq("card_id", cardId)
      .eq("user_id", user.id)
      .order("position", { ascending: true });

    if (fetchError) {
      console.error("Error fetching card images:", fetchError);
      return NextResponse.json(
        { error: "Failed to fetch card images" },
        { status: 500 }
      );
    }

    // Generate public URLs for each image
    const imagesWithUrls = (images || []).map((img: CardImage) => ({
      ...img,
      url: supabase.storage.from("card-images").getPublicUrl(img.storage_path)
        .data.publicUrl,
    }));

    return NextResponse.json({ images: imagesWithUrls });
  } catch (error) {
    console.error("Error in GET /api/cards/[id]/images:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/cards/[id]/images - Upload new images
export async function POST(
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

    // Verify card ownership
    const { data: card, error: cardError } = await supabase
      .from("collection_items")
      .select("id")
      .eq("id", cardId)
      .eq("user_id", user.id)
      .single();

    if (cardError || !card) {
      return NextResponse.json(
        { error: "Card not found or access denied" },
        { status: 404 }
      );
    }

    const formData = await request.formData();
    const files = formData.getAll("files") as File[];

    if (!files || files.length === 0) {
      return NextResponse.json(
        { error: "No files provided" },
        { status: 400 }
      );
    }

    // Get current max position for this card
    const { data: existingImages } = await supabase
      .from("card_images")
      .select("position")
      .eq("card_id", cardId)
      .order("position", { ascending: false })
      .limit(1);

    let nextPosition = existingImages && existingImages.length > 0
      ? existingImages[0].position + 1
      : 0;

    const uploadedImages = [];

    for (const file of files) {
      // Validate file type
      if (!file.type.startsWith("image/")) {
        continue; // Skip non-image files
      }

      // Validate file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        continue; // Skip files over 10MB
      }

      // Generate unique filename
      const fileExt = file.name.split(".").pop();
      const fileName = `${crypto.randomUUID()}.${fileExt}`;
      const storagePath = `${user.id}/${cardId}/${fileName}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from("card-images")
        .upload(storagePath, file, {
          contentType: file.type,
          upsert: false,
        });

      if (uploadError) {
        console.error("Error uploading file:", uploadError);
        continue; // Skip this file and continue with others
      }

      // Insert record into card_images
      const { data: imageRecord, error: insertError } = await supabase
        .from("card_images")
        .insert({
          card_id: cardId,
          user_id: user.id,
          storage_path: storagePath,
          position: nextPosition,
        })
        .select()
        .single();

      if (insertError) {
        console.error("Error inserting card_image record:", insertError);
        // Clean up uploaded file
        await supabase.storage.from("card-images").remove([storagePath]);
        continue;
      }

      // Get public URL
      const url = supabase.storage
        .from("card-images")
        .getPublicUrl(storagePath).data.publicUrl;

      uploadedImages.push({
        ...imageRecord,
        url,
      });

      nextPosition++;
    }

    return NextResponse.json({ images: uploadedImages });
  } catch (error) {
    console.error("Error in POST /api/cards/[id]/images:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE /api/cards/[id]/images - Delete an image
export async function DELETE(
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

    const { searchParams } = new URL(request.url);
    const imageId = searchParams.get("imageId");

    if (!imageId) {
      return NextResponse.json(
        { error: "Image ID required" },
        { status: 400 }
      );
    }

    // Fetch the image record to get storage path
    const { data: image, error: fetchError } = await supabase
      .from("card_images")
      .select("*")
      .eq("id", imageId)
      .eq("card_id", cardId)
      .eq("user_id", user.id)
      .single();

    if (fetchError || !image) {
      return NextResponse.json(
        { error: "Image not found or access denied" },
        { status: 404 }
      );
    }

    // Delete from storage
    const { error: storageError } = await supabase.storage
      .from("card-images")
      .remove([image.storage_path]);

    if (storageError) {
      console.error("Error deleting from storage:", storageError);
      // Continue with DB deletion even if storage fails
    }

    // Delete from database
    const { error: deleteError } = await supabase
      .from("card_images")
      .delete()
      .eq("id", imageId)
      .eq("user_id", user.id);

    if (deleteError) {
      console.error("Error deleting card_image record:", deleteError);
      return NextResponse.json(
        { error: "Failed to delete image" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in DELETE /api/cards/[id]/images:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// PATCH /api/cards/[id]/images - Reorder images
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
    const { imageOrders } = body; // Array of { id: string, position: number }

    if (!imageOrders || !Array.isArray(imageOrders)) {
      return NextResponse.json(
        { error: "Invalid image orders" },
        { status: 400 }
      );
    }

    // Update positions for each image
    for (const { id, position } of imageOrders) {
      await supabase
        .from("card_images")
        .update({ position })
        .eq("id", id)
        .eq("card_id", cardId)
        .eq("user_id", user.id);
    }

    // Fetch updated images
    const { data: images } = await supabase
      .from("card_images")
      .select("*")
      .eq("card_id", cardId)
      .eq("user_id", user.id)
      .order("position", { ascending: true });

    const imagesWithUrls = (images || []).map((img: CardImage) => ({
      ...img,
      url: supabase.storage.from("card-images").getPublicUrl(img.storage_path)
        .data.publicUrl,
    }));

    return NextResponse.json({ images: imagesWithUrls });
  } catch (error) {
    console.error("Error in PATCH /api/cards/[id]/images:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
