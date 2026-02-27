import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const admin = await getAdminAuth();
  if (!admin.user) {
    return admin.unauthorizedResponse!;
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const listingId = formData.get("listingId") as string | null;

  if (!file || !listingId) {
    return NextResponse.json(
      { error: "file and listingId required" },
      { status: 400 }
    );
  }

  if (!file.type.startsWith("image/")) {
    return NextResponse.json(
      { error: "File must be an image" },
      { status: 400 }
    );
  }

  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json(
      { error: "File must be under 10MB" },
      { status: 400 }
    );
  }

  const ext = file.name.split(".").pop() ?? "jpg";
  const storagePath = `shop/${listingId}/${crypto.randomUUID()}.${ext}`;

  const supabase = await createServiceClient();

  const { error: uploadError } = await supabase.storage
    .from("shop-images")
    .upload(storagePath, file, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    console.error("Shop image upload error:", uploadError);
    return NextResponse.json(
      { error: "Upload failed" },
      { status: 500 }
    );
  }

  const url = supabase.storage
    .from("shop-images")
    .getPublicUrl(storagePath).data.publicUrl;

  return NextResponse.json({ url, storagePath });
}
