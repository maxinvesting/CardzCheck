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
    const { name } = body;

    // Validate name
    if (name !== null && name !== undefined) {
      if (typeof name !== "string") {
        return NextResponse.json(
          { error: "Name must be a string" },
          { status: 400 }
        );
      }

      const trimmedName = name.trim();
      if (trimmedName.length > 100) {
        return NextResponse.json(
          { error: "Name must be 100 characters or less" },
          { status: 400 }
        );
      }

      // Update user record
      const { error: updateError } = await supabase
        .from("users")
        .update({ name: trimmedName || null })
        .eq("id", user.id);

      if (updateError) {
        console.error("Error updating user name:", updateError);
        return NextResponse.json(
          { error: "Failed to update name" },
          { status: 500 }
        );
      }

      return NextResponse.json({ success: true });
    } else {
      // Allow setting name to null
      const { error: updateError } = await supabase
        .from("users")
        .update({ name: null })
        .eq("id", user.id);

      if (updateError) {
        console.error("Error updating user name:", updateError);
        return NextResponse.json(
          { error: "Failed to update name" },
          { status: 500 }
        );
      }

      return NextResponse.json({ success: true });
    }
  } catch (error) {
    console.error("Name update error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
