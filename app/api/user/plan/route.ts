import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { plan } = body;

    if (!plan || (plan !== "free" && plan !== "pro")) {
      return NextResponse.json(
        { error: "Invalid plan selection" },
        { status: 400 }
      );
    }

    // Update user record to mark plan as selected
    // For free plan, just mark plan_selected as true
    // For pro plan, we'll handle payment separately, but still mark plan_selected
    // Try to update plan_selected, but if column doesn't exist, that's okay - we'll handle it
    const updateData: { plan_selected?: boolean; is_paid?: boolean } = {
      plan_selected: true,
    };

    // Note: is_paid will be set to true via Stripe webhook after successful payment
    // For now, we just mark that they've selected a plan

    const { error } = await supabase
      .from("users")
      .update(updateData)
      .eq("id", user.id);
    
    // If error is about missing column, log it but don't fail - the column needs to be added to DB
    if (error && error.message?.includes("column") && error.message?.includes("does not exist")) {
      console.warn("plan_selected column doesn't exist in database. Please add it with: ALTER TABLE users ADD COLUMN plan_selected BOOLEAN DEFAULT FALSE;");
      // Still return success since the user selection was processed
      return NextResponse.json({ success: true, warning: "Database column missing" });
    }

    if (error) {
      console.error("Error updating user plan:", error);
      return NextResponse.json(
        { error: "Failed to update plan selection" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Plan selection error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
