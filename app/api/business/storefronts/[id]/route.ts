import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireBusinessAccess } from "@/lib/business/actions";
import type { StorefrontPlatform } from "@/types";
import { STOREFRONT_PLATFORMS } from "@/types";

export const dynamic = "force-dynamic";

const VALID_PLATFORMS = STOREFRONT_PLATFORMS.map((p) => p.value);

function validateUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ["http:", "https:"].includes(parsed.protocol);
  } catch {
    return false;
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await requireBusinessAccess(user.id);

    const { data: existing } = await supabase
      .from("user_storefronts")
      .select("id")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!existing) {
      return NextResponse.json(
        { error: "Storefront not found" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const updates: Record<string, unknown> = {};

    if (body.platform !== undefined) {
      if (!VALID_PLATFORMS.includes(body.platform as StorefrontPlatform)) {
        return NextResponse.json(
          { error: `platform must be one of: ${VALID_PLATFORMS.join(", ")}` },
          { status: 400 }
        );
      }
      updates.platform = body.platform;
    }

    if (body.display_name !== undefined) {
      const name = typeof body.display_name === "string" ? body.display_name.trim() : "";
      if (!name) {
        return NextResponse.json(
          { error: "display_name cannot be empty" },
          { status: 400 }
        );
      }
      if (name.length > 100) {
        return NextResponse.json(
          { error: "display_name must be 100 characters or less" },
          { status: 400 }
        );
      }
      updates.display_name = name;
    }

    if (body.store_url !== undefined) {
      const url = typeof body.store_url === "string" ? body.store_url.trim() : "";
      if (!url) {
        return NextResponse.json(
          { error: "store_url cannot be empty" },
          { status: 400 }
        );
      }
      if (!validateUrl(url)) {
        return NextResponse.json(
          { error: "store_url must be a valid HTTP/HTTPS URL" },
          { status: 400 }
        );
      }
      if (url.length > 2048) {
        return NextResponse.json(
          { error: "store_url must be 2048 characters or less" },
          { status: 400 }
        );
      }
      updates.store_url = url;
    }

    if (body.is_primary === true) {
      await supabase
        .from("user_storefronts")
        .update({ is_primary: false })
        .eq("user_id", user.id);
      updates.is_primary = true;
    }

    if (body.notes !== undefined) {
      updates.notes =
        typeof body.notes === "string" ? body.notes.trim() || null : null;
    }

    if (body.platform_settings !== undefined && typeof body.platform_settings === "object") {
      const { data: current } = await supabase
        .from("user_storefronts")
        .select("platform_settings")
        .eq("id", id)
        .eq("user_id", user.id)
        .single();

      const existingSettings =
        current?.platform_settings && typeof current.platform_settings === "object"
          ? current.platform_settings
          : {};
      updates.platform_settings = { ...existingSettings, ...body.platform_settings };
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("user_storefronts")
      .update(updates)
      .eq("id", id)
      .eq("user_id", user.id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ storefront: data });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to update storefront";
    const status = (err as any)?.status ?? 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await requireBusinessAccess(user.id);

    const { data: existing } = await supabase
      .from("user_storefronts")
      .select("id, is_primary")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!existing) {
      return NextResponse.json(
        { error: "Storefront not found" },
        { status: 404 }
      );
    }

    const { error } = await supabase
      .from("user_storefronts")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) throw error;

    if (existing.is_primary) {
      const { data: remaining } = await supabase
        .from("user_storefronts")
        .select("id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
        .limit(1);

      if (remaining && remaining.length > 0) {
        await supabase
          .from("user_storefronts")
          .update({ is_primary: true })
          .eq("id", remaining[0].id);
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to delete storefront";
    const status = (err as any)?.status ?? 500;
    return NextResponse.json({ error: message }, { status });
  }
}
