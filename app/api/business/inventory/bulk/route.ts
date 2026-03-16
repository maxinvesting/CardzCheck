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
      ids: unknown;
      updates: { status?: string; location?: string };
    };

    if (!Array.isArray(ids) || ids.length === 0 || !updates)
      return NextResponse.json(
        { error: "ids and updates required" },
        { status: 400 }
      );

    if (ids.length > 200)
      return NextResponse.json(
        { error: "Too many IDs (max 200 per request)" },
        { status: 400 }
      );

    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const invalidIds = ids.filter((id) => typeof id !== "string" || !UUID_RE.test(id));
    if (invalidIds.length > 0)
      return NextResponse.json(
        { error: "All ids must be valid UUIDs" },
        { status: 400 }
      );

    await bulkUpdateInventory(user.id, ids as string[], updates);
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
