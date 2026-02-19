import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isTestMode } from "@/lib/test-mode";
import { logDebug } from "@/lib/logging";

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

    if (!hasName && !hasBusinessName) {
      return NextResponse.json(
        { error: "No profile fields provided" },
        { status: 400 }
      );
    }

    const updates: { name?: string | null; business_name?: string | null } = {};

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

    const { error: updateError } = await supabase
      .from("users")
      .update(updates)
      .eq("id", user.id);

    if (updateError) {
      console.error("Error updating user profile:", updateError);
      return NextResponse.json(
        { error: "Failed to update profile" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Name update error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
