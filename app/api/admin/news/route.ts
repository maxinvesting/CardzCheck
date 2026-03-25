import { NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/server";

function stripHtml(str: string): string {
  return str.replace(/<[^>]*>/g, "").trim();
}

export async function GET() {
  const admin = await getAdminAuth();
  if (!admin.user) return admin.unauthorizedResponse!;

  const service = await createServiceClient();
  const { data, error } = await service
    .from("announcements")
    .select("*")
    .order("is_pinned", { ascending: false })
    .order("published_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ announcements: data ?? [] });
}

export async function POST(request: Request) {
  const admin = await getAdminAuth();
  if (!admin.user) return admin.unauthorizedResponse!;

  const body = await request.json();
  const { title, body: bodyText, category, is_public, is_pinned, published_at } = body;

  if (!title?.trim() || !bodyText?.trim() || !category) {
    return NextResponse.json({ error: "title, body, and category are required." }, { status: 400 });
  }

  if (title.length > 300) {
    return NextResponse.json({ error: "title must be 300 characters or fewer." }, { status: 400 });
  }
  if (bodyText.length > 10000) {
    return NextResponse.json({ error: "body must be 10000 characters or fewer." }, { status: 400 });
  }

  const sanitizedTitle = stripHtml(title);
  const sanitizedBody = stripHtml(bodyText);

  const VALID_CATEGORIES = ["general", "platform", "grading", "market", "business"];
  if (!VALID_CATEGORIES.includes(category)) {
    return NextResponse.json({ error: "Invalid category." }, { status: 400 });
  }

  const service = await createServiceClient();
  const { data, error } = await service
    .from("announcements")
    .insert({
      title: sanitizedTitle,
      body: sanitizedBody,
      category,
      is_public: Boolean(is_public ?? true),
      is_pinned: Boolean(is_pinned ?? false),
      published_at: published_at || new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ announcement: data }, { status: 201 });
}

export async function PATCH(request: Request) {
  const admin = await getAdminAuth();
  if (!admin.user) return admin.unauthorizedResponse!;

  const body = await request.json();
  const { id, ...updates } = body;

  if (!id) {
    return NextResponse.json({ error: "id is required." }, { status: 400 });
  }

  const ALLOWED_FIELDS = ["title", "body", "category", "is_public", "is_pinned", "published_at"];
  const filtered: Record<string, unknown> = {};
  for (const key of ALLOWED_FIELDS) {
    if (key in updates) filtered[key] = updates[key];
  }

  if (Object.keys(filtered).length === 0) {
    return NextResponse.json({ error: "No valid fields to update." }, { status: 400 });
  }

  if (filtered.title && typeof filtered.title === "string") {
    filtered.title = filtered.title.trim();
  }
  if (filtered.body && typeof filtered.body === "string") {
    filtered.body = (filtered.body as string).trim();
  }

  const service = await createServiceClient();
  const { data, error } = await service
    .from("announcements")
    .update(filtered)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ announcement: data });
}

export async function DELETE(request: Request) {
  const admin = await getAdminAuth();
  if (!admin.user) return admin.unauthorizedResponse!;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id query param is required." }, { status: 400 });
  }

  const service = await createServiceClient();
  const { error } = await service.from("announcements").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
