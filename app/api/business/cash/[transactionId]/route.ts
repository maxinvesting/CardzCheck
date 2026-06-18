import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireBusinessAccess } from "@/lib/business/actions";
import {
  missingCashTable,
  softDeleteCashTransaction,
} from "@/lib/business/cash";

export const dynamic = "force-dynamic";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// DELETE /api/business/cash/[transactionId]
// Soft-deletes a *manual* cash entry (opening balance / adjustment / purchase).
// Sale and trade rows are managed by their source event and cannot be removed
// here — undo or delete the underlying sale/trade instead.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ transactionId: string }> }
): Promise<NextResponse> {
  try {
    const { transactionId } = await params;
    if (!UUID_REGEX.test(transactionId)) {
      return NextResponse.json({ error: "Invalid transaction id" }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const context = await requireBusinessAccess(user.id);

    // Confirm the row belongs to this account and is a manual entry.
    const { data: existing, error: fetchError } = await supabase
      .from("business_cash_transactions")
      .select("id, source_type, is_deleted")
      .eq("id", transactionId)
      .eq("business_account_id", context.businessAccountId)
      .maybeSingle();

    if (fetchError) {
      if (missingCashTable(fetchError)) {
        return NextResponse.json(
          { error: "Cash ledger migration required", needs_migration: true },
          { status: 503 }
        );
      }
      throw fetchError;
    }
    if (!existing || existing.is_deleted) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    }
    if (existing.source_type) {
      return NextResponse.json(
        {
          error:
            "This cash entry comes from a sale or trade. Undo or delete that record instead.",
        },
        { status: 400 }
      );
    }

    const result = await softDeleteCashTransaction({
      supabase,
      businessAccountId: context.businessAccountId,
      transactionId,
    });
    if (!result.ok) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const status = (error as { status?: number })?.status ?? 500;
    const message =
      error instanceof Error ? error.message : "Failed to delete cash entry";
    return NextResponse.json({ error: message }, { status });
  }
}
