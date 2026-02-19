import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireBusinessAccess, bulkUpdateInventory } from "@/lib/business/actions";

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { ids, updates } = body as {
      ids: string[];
      updates: { status?: string; location?: string };
    };

    if (!ids?.length || !updates)
      return NextResponse.json(
        { error: "ids and updates required" },
        { status: 400 }
      );

    await bulkUpdateInventory(user.id, ids, updates);
    return NextResponse.json({ updated: ids.length });
  } catch (err: any) {
    if (err?.status === 403)
      return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("Business bulk update error:", err);
    return NextResponse.json(
      { error: "Failed to bulk update" },
      { status: 500 }
    );
  }
}
