import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  listSales,
  createSale,
  requireBusinessAccess,
} from "@/lib/business/actions";
import {
  createSaleSchema,
  listSalesQuerySchema,
} from "@/lib/business/sales-schemas";
import {
  getInventorySnapshots,
  recordLedgerAction,
} from "@/lib/business/ledger-actions";

async function getAuthUserId() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthUserId();
    if (!userId)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const parsedQuery = listSalesQuerySchema.safeParse({
      from: request.nextUrl.searchParams.get("from") ?? undefined,
      to: request.nextUrl.searchParams.get("to") ?? undefined,
      page: request.nextUrl.searchParams.get("page") ?? undefined,
      page_size: request.nextUrl.searchParams.get("page_size") ?? undefined,
      channel: request.nextUrl.searchParams.get("channel") ?? undefined,
      search: request.nextUrl.searchParams.get("search") ?? undefined,
      inventory_item_id:
        request.nextUrl.searchParams.get("inventory_item_id") ?? undefined,
    });

    if (!parsedQuery.success) {
      return NextResponse.json(
        { error: "Invalid query", details: parsedQuery.error.flatten() },
        { status: 400 }
      );
    }

    const result = await listSales(userId, {
      from: parsedQuery.data.from,
      to: parsedQuery.data.to,
      page: parsedQuery.data.page,
      pageSize: parsedQuery.data.page_size,
      channel: parsedQuery.data.channel,
      search: parsedQuery.data.search,
      inventoryItemId: parsedQuery.data.inventory_item_id,
    });

    return NextResponse.json(result);
  } catch (err: any) {
    if (err?.status === 403)
      return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("Business sales GET error:", err);
    return NextResponse.json(
      { error: "Failed to load sales" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthUserId();
    if (!userId)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const parsed = createSaleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payload", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const context = await requireBusinessAccess(userId);
    const inventoryBeforeRows = parsed.data.inventory_item_id
      ? await getInventorySnapshots(supabase, userId, [parsed.data.inventory_item_id])
      : [];

    const sale = await createSale(userId, parsed.data);
    await recordLedgerAction({
      supabase,
      userId,
      businessAccountId: context.businessAccountId,
      actionType: "sale_create",
      label: "record sale",
      payload: {
        saleId: sale.id,
        inventoryItemId: sale.inventory_item_id,
        inventoryBeforeRows,
      },
    });
    return NextResponse.json(sale, { status: 201 });
  } catch (err: any) {
    if (err?.status === 403)
      return NextResponse.json({ error: err.message }, { status: 403 });
    // 400 includes validation and mapped business errors (e.g. duplicate external_order_id).
    if (err?.status === 400)
      return NextResponse.json({ error: err.message }, { status: 400 });
    // Enrich logging for debugging: Supabase/Postgres code, message, details (no PII).
    console.error("Business sales POST error:", {
      message: err?.message,
      code: err?.code,
      details: err?.details,
      hint: err?.hint,
    });
    return NextResponse.json(
      { error: "Failed to create sale" },
      { status: 500 }
    );
  }
}
