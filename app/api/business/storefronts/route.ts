import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireBusinessOwnerContext } from "@/lib/business/context";
import type { StorefrontPlatform, UserStorefront, StorefrontPlatformSettings } from "@/types";
import { STOREFRONT_PLATFORMS, getDefaultPlatformSettings } from "@/types";

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

export async function GET(): Promise<NextResponse> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await requireBusinessOwnerContext(user.id);

    const { data, error } = await supabase
      .from("user_storefronts")
      .select("*")
      .eq("user_id", user.id)
      .order("is_primary", { ascending: false })
      .order("created_at", { ascending: true });

    if (error) throw error;

    return NextResponse.json({ storefronts: data ?? [] });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to fetch storefronts";
    const status = (err as any)?.status ?? 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await requireBusinessOwnerContext(user.id);

    const body = await request.json();
    const { platform, display_name, store_url, is_primary, notes, platform_settings } = body as {
      platform?: string;
      display_name?: string;
      store_url?: string;
      is_primary?: boolean;
      notes?: string;
      platform_settings?: StorefrontPlatformSettings;
    };

    if (
      !platform ||
      !VALID_PLATFORMS.includes(platform as StorefrontPlatform)
    ) {
      return NextResponse.json(
        { error: `platform must be one of: ${VALID_PLATFORMS.join(", ")}` },
        { status: 400 }
      );
    }

    if (!display_name || typeof display_name !== "string" || !display_name.trim()) {
      return NextResponse.json(
        { error: "display_name is required" },
        { status: 400 }
      );
    }

    if (display_name.trim().length > 100) {
      return NextResponse.json(
        { error: "display_name must be 100 characters or less" },
        { status: 400 }
      );
    }

    if (!store_url || typeof store_url !== "string" || !store_url.trim()) {
      return NextResponse.json(
        { error: "store_url is required" },
        { status: 400 }
      );
    }

    if (!validateUrl(store_url.trim())) {
      return NextResponse.json(
        { error: "store_url must be a valid HTTP/HTTPS URL" },
        { status: 400 }
      );
    }

    if (store_url.trim().length > 2048) {
      return NextResponse.json(
        { error: "store_url must be 2048 characters or less" },
        { status: 400 }
      );
    }

    const { data: existing } = await supabase
      .from("user_storefronts")
      .select("id")
      .eq("user_id", user.id);

    const count = existing?.length ?? 0;
    if (count >= 10) {
      return NextResponse.json(
        { error: "Maximum of 10 storefronts allowed" },
        { status: 400 }
      );
    }

    const shouldBePrimary = is_primary === true || count === 0;

    if (shouldBePrimary && count > 0) {
      await supabase
        .from("user_storefronts")
        .update({ is_primary: false })
        .eq("user_id", user.id);
    }

    const defaults = getDefaultPlatformSettings(platform as StorefrontPlatform);
    const mergedSettings = platform_settings
      ? { ...defaults, ...platform_settings }
      : defaults;

    const { data, error } = await supabase
      .from("user_storefronts")
      .insert({
        user_id: user.id,
        platform: platform as StorefrontPlatform,
        display_name: display_name.trim(),
        store_url: store_url.trim(),
        is_primary: shouldBePrimary,
        notes: notes?.trim() || null,
        platform_settings: mergedSettings,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ storefront: data }, { status: 201 });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to create storefront";
    const status = (err as any)?.status ?? 500;
    return NextResponse.json({ error: message }, { status });
  }
}
