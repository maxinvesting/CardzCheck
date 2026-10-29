import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireBusinessAccess } from "@/lib/business/actions";
import { softDeleteDebtTransaction } from "@/lib/business/debt";

export const dynamic = "force-dynamic";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// DELETE /api/business/debt/[transactionId] — soft-deletes a debt entry.
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

    const ok = await softDeleteDebtTransaction({
      supabase,
      businessAccountId: context.businessAccountId,
      transactionId,
    });
    if (!ok) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    const status = (error as { status?: number })?.status ?? 500;
    const message = error instanceof Error ? error.message : "Failed to delete debt entry";
    return NextResponse.json({ error: message }, { status });
  }
}
