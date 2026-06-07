import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { bulkUpdateInventory, requireBusinessAccess } from "@/lib/business/actions";
import {
  getInventorySnapshots,
  recordLedgerAction,
} from "@/lib/business/ledger-actions";

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
      updates: {
        status?: string;
        location?: string;
        channel?: string | null;
        list_price_cents?: number | null;
      };
    };

    if (!ids?.length || !updates)
      return NextResponse.json(
        { error: "ids and updates required" },
        { status: 400 }
      );

    const context = await requireBusinessAccess(user.id);
    const beforeRows = await getInventorySnapshots(supabase, user.id, ids);
    await bulkUpdateInventory(user.id, ids, updates);
    if (beforeRows.length > 0) {
      await recordLedgerAction({
        supabase,
        userId: user.id,
        businessAccountId: context.businessAccountId,
        actionType: "inventory_bulk_update",
        label: "bulk edit",
        payload: {
          itemIds: ids,
          beforeRows,
        },
      });
    }
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
