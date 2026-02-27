import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isTestMode } from "@/lib/test-mode";
import { logDebug } from "@/lib/logging";

/** GET: Return current user profile (name, business_name, ebay_store_url, app_role). Server-authoritative so Business page can rely on it. */
export async function GET() {
  try {
    type ProfileRow = {
      name?: string | null;
      business_name?: string | null;
      ebay_store_url?: string | null;
      app_role?: string | null;
    };

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let row: ProfileRow | null = null;

    let selectError: { code?: string | null; message?: string | null } | null = null;

    const primarySelect = await supabase
      .from("users")
      .select("name, business_name, ebay_store_url, app_role")
      .eq("id", user.id)
      .maybeSingle();

    if (primarySelect.error && isMissingColumnError(primarySelect.error, "app_role")) {
      const fallbackSelect = await supabase
        .from("users")
        .select("name, business_name, ebay_store_url")
        .eq("id", user.id)
        .maybeSingle();

      row = (fallbackSelect.data ?? null) as ProfileRow | null;
      selectError = fallbackSelect.error;
    } else {
      row = (primarySelect.data ?? null) as ProfileRow | null;
      selectError = primarySelect.error;
    }

    if (selectError) {
      if (!isMissingColumnError(selectError, "ebay_store_url")) {
        console.error("Profile GET select error:", selectError);
        return NextResponse.json({ error: "Failed to load profile" }, { status: 500 });
      }

      const metadataUrl =
        typeof user.user_metadata?.ebay_store_url === "string"
          ? user.user_metadata.ebay_store_url.trim() || null
          : null;

      return NextResponse.json({
        name: null,
        business_name: null,
        ebay_store_url: metadataUrl,
        app_role: null,
      });
    }

    const metadataUrl =
      typeof user.user_metadata?.ebay_store_url === "string"
        ? user.user_metadata.ebay_store_url.trim() || null
        : null;

    return NextResponse.json({
      name: row?.name ?? null,
      business_name: row?.business_name ?? null,
      ebay_store_url:
        (row && "ebay_store_url" in row && typeof row.ebay_store_url === "string"
          ? row.ebay_store_url.trim() || null
          : null) ?? metadataUrl,
      app_role:
        row && "app_role" in row && typeof row.app_role === "string"
          ? row.app_role
          : null,
    });
  } catch (err) {
    console.error("Profile GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

function isMissingColumnError(
  error: { code?: string | null; message?: string | null } | null,
  columnName: string
) {
  if (!error) return false;
  const code = String(error.code || "");
  const message = String(error.message || "").toLowerCase();
  const column = columnName.toLowerCase();
  return (
    code === "42703" ||
    code === "PGRST204" ||
    message.includes(`column "${column}"`) ||
    message.includes(`'${column}'`) ||
    message.includes(column)
  );
}

export async function PATCH(request: NextRequest) {
  try {
    if (isTestMode()) {
      logDebug("🧪 TEST MODE: Bypassing name update auth check");
      return NextResponse.json({ success: true });
    }

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const hasName = Object.prototype.hasOwnProperty.call(body, "name");
    const hasBusinessName = Object.prototype.hasOwnProperty.call(
      body,
      "business_name"
    );
    const hasEbayStoreUrl = Object.prototype.hasOwnProperty.call(
      body,
      "ebay_store_url"
    );

    if (!hasName && !hasBusinessName && !hasEbayStoreUrl) {
      return NextResponse.json(
        { error: "No profile fields provided" },
        { status: 400 }
      );
    }

    const updates: {
      name?: string | null;
      business_name?: string | null;
      ebay_store_url?: string | null;
    } = {};

    if (hasName) {
      const name = body.name;
      if (name !== null && name !== undefined && typeof name !== "string") {
        return NextResponse.json(
          { error: "Name must be a string" },
          { status: 400 }
        );
      }

      const trimmedName =
        typeof name === "string" ? name.trim() : "";
      if (trimmedName.length > 100) {
        return NextResponse.json(
          { error: "Name must be 100 characters or less" },
          { status: 400 }
        );
      }

      updates.name = trimmedName || null;
    }

    if (hasBusinessName) {
      const businessName = body.business_name;
      if (
        businessName !== null &&
        businessName !== undefined &&
        typeof businessName !== "string"
      ) {
        return NextResponse.json(
          { error: "Business name must be a string" },
          { status: 400 }
        );
      }

      const trimmedBusinessName =
        typeof businessName === "string" ? businessName.trim() : "";
      if (trimmedBusinessName.length > 120) {
        return NextResponse.json(
          { error: "Business name must be 120 characters or less" },
          { status: 400 }
        );
      }

      updates.business_name = trimmedBusinessName || null;
    }

    if (hasEbayStoreUrl) {
      const ebayStoreUrl = body.ebay_store_url;
      if (
        ebayStoreUrl !== null &&
        ebayStoreUrl !== undefined &&
        typeof ebayStoreUrl !== "string"
      ) {
        return NextResponse.json(
          { error: "eBay Store URL must be a string" },
          { status: 400 }
        );
      }

      const trimmedUrl =
        typeof ebayStoreUrl === "string" ? ebayStoreUrl.trim() : "";
      if (trimmedUrl) {
        try {
          const parsed = new URL(trimmedUrl);
          if (!["http:", "https:"].includes(parsed.protocol)) {
            return NextResponse.json(
              { error: "eBay Store URL must use http or https" },
              { status: 400 }
            );
          }
          if (trimmedUrl.length > 2048) {
            return NextResponse.json(
              { error: "eBay Store URL must be 2048 characters or less" },
              { status: 400 }
            );
          }
        } catch {
          return NextResponse.json(
            { error: "eBay Store URL must be a valid URL" },
            { status: 400 }
          );
        }
      }
      updates.ebay_store_url = trimmedUrl || null;
    }

    const upsertPayload: {
      id: string;
      name?: string | null;
      business_name?: string | null;
      ebay_store_url?: string | null;
    } = {
      id: user.id,
      ...updates,
    };

    const { error: updateError } = await supabase
      .from("users")
      .upsert(upsertPayload, { onConflict: "id" });

    if (updateError) {
      if (hasEbayStoreUrl && isMissingColumnError(updateError, "ebay_store_url")) {
        const { ebay_store_url, ...nonEbayUpdates } = upsertPayload;

        if (Object.keys(nonEbayUpdates).length > 0) {
          const { error: nonEbayUpdateError } = await supabase
            .from("users")
            .upsert(nonEbayUpdates, { onConflict: "id" });

          if (nonEbayUpdateError) {
            console.error("Error updating non-eBay user profile fields:", nonEbayUpdateError);
            return NextResponse.json(
              { error: "Failed to update profile" },
              { status: 500 }
            );
          }
        }

        const { error: metadataError } = await supabase.auth.updateUser({
          data: { ebay_store_url: ebay_store_url ?? null },
        });

        if (metadataError) {
          console.error("Error updating eBay store URL metadata fallback:", metadataError);
          return NextResponse.json(
            { error: "Failed to update eBay Store URL" },
            { status: 500 }
          );
        }

        return NextResponse.json({
          success: true,
          usedMetadataFallback: true,
          data: { ebay_store_url: ebay_store_url ?? null },
        });
      }

      console.error("Error updating user profile:", updateError);
      return NextResponse.json(
        { error: "Failed to update profile" },
        { status: 500 }
      );
    }

    if (hasEbayStoreUrl) {
      const { error: metadataSyncError } = await supabase.auth.updateUser({
        data: { ebay_store_url: updates.ebay_store_url ?? null },
      });
      if (metadataSyncError) {
        console.warn("Failed to sync ebay_store_url to auth metadata:", metadataSyncError);
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        ...(hasName ? { name: updates.name ?? null } : {}),
        ...(hasBusinessName ? { business_name: updates.business_name ?? null } : {}),
        ...(hasEbayStoreUrl ? { ebay_store_url: updates.ebay_store_url ?? null } : {}),
      },
    });
  } catch (error) {
    console.error("Name update error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
