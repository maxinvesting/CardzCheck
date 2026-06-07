import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createInventoryItem, requireBusinessAccess } from "@/lib/business/actions";
import { getTierGates } from "@/lib/access";
import { recordLedgerAction } from "@/lib/business/ledger-actions";
import { uniqueTrustedImageUrls } from "@/lib/images/shared";

const MAX_ROWS_PER_CALL = 100;

interface BulkCertRowInput {
  cert: string;
  player_name?: string | null;
  year?: string | null;
  set_name?: string | null;
  card_number?: string | null;
  parallel_type?: string | null;
  grade?: string | null;
  grading_company?: string | null;
  quantity?: number | null;
  cost_basis_total_cents?: number | null;
  channel?: string | null;
  status?: string | null;
  acquisition_type?: string | null;
  acquisition_date?: string | null;
  image_urls?: string[] | null;
  image_url?: string | null;
  user_image_url?: string | null;
  image_source?: string | null;
  notes?: string | null;
}

function buildTitle(row: BulkCertRowInput): string {
  return [row.year, row.set_name, row.player_name, row.card_number ? `#${row.card_number}` : null, row.grade]
    .filter(Boolean)
    .join(" ")
    .trim();
}

function getRowImageUrls(row: BulkCertRowInput): string[] {
  return uniqueTrustedImageUrls([
    ...(Array.isArray(row.image_urls) ? row.image_urls : []),
    row.user_image_url,
    row.image_url,
  ]).slice(0, 3);
}

async function insertCardImages(args: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  itemId: string;
  imageUrls: string[];
}): Promise<void> {
  if (args.imageUrls.length === 0) return;

  const imageRecords = args.imageUrls.map((url, index) => ({
    card_id: args.itemId,
    user_id: args.userId,
    storage_path: url,
    position: index,
    label: index === 0 ? "front" : index === 1 ? "back" : null,
  }));

  const { error } = await args.supabase.from("card_images").insert(imageRecords);
  if (error) {
    console.warn("[bulk-cert] failed to insert card images", {
      itemId: args.itemId,
      error: error.message,
    });
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const gates = await getTierGates(user.id);
  if (!gates.canBulkAddByCert) {
    return NextResponse.json(
      {
        error: "Bulk PSA cert import requires Business Pro.",
        upgradeRequired: true,
      },
      { status: 403 }
    );
  }

  let body: { rows?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!Array.isArray(body.rows) || body.rows.length === 0) {
    return NextResponse.json({ error: "rows array required" }, { status: 400 });
  }
  if (body.rows.length > MAX_ROWS_PER_CALL) {
    return NextResponse.json(
      { error: `Too many rows (max ${MAX_ROWS_PER_CALL} per call)` },
      { status: 400 }
    );
  }

  const rows = body.rows as BulkCertRowInput[];
  const context = await requireBusinessAccess(user.id);

  type InsertOutcome =
    | { cert: string; status: "added"; id: string }
    | { cert: string; status: "failed"; error: string };

  const results: InsertOutcome[] = [];
  const addedIds: string[] = [];

  for (const row of rows) {
    const cert = typeof row.cert === "string" ? row.cert.trim() : "";
    if (!cert) {
      results.push({ cert: "", status: "failed", error: "Missing cert number" });
      continue;
    }

    try {
      const imageUrls = getRowImageUrls(row);
      const primaryImageUrl = imageUrls[0] ?? null;
      const payload = {
        title: buildTitle(row) || `PSA Cert ${cert}`,
        player_name: row.player_name ?? null,
        year: row.year ?? null,
        set_name: row.set_name ?? null,
        parallel_type: row.parallel_type ?? null,
        card_number: row.card_number ?? null,
        quantity: row.quantity ?? 1,
        acquisition_type: row.acquisition_type ?? "bought",
        acquisition_date: row.acquisition_date ?? null,
        cost_basis_total_cents: row.cost_basis_total_cents ?? null,
        condition_status: "graded" as const,
        grading_company: row.grading_company ?? "PSA",
        grade: row.grade ?? null,
        cert_number: cert,
        psa_cert_number: cert,
        channel: row.channel ?? null,
        status: row.status ?? "unlisted",
        image_url: primaryImageUrl,
        image_source: primaryImageUrl ? "user" : "none",
        user_image_url: primaryImageUrl,
        notes: row.notes ?? null,
      };

      const item = await createInventoryItem(user.id, payload as any);
      await insertCardImages({
        supabase,
        userId: user.id,
        itemId: item.id,
        imageUrls,
      });
      addedIds.push(item.id);
      results.push({ cert, status: "added", id: item.id });
    } catch (err: any) {
      console.error("[bulk-cert] insert failed", cert, err);
      const message =
        typeof err?.message === "string" && err.message.trim().length > 0
          ? err.message
          : "Insert failed";
      results.push({ cert, status: "failed", error: message });
    }
  }

  const added = results.filter((r) => r.status === "added").length;
  const failed = results.length - added;

  if (addedIds.length > 0) {
    await recordLedgerAction({
      supabase,
      userId: user.id,
      businessAccountId: context.businessAccountId,
      actionType: "inventory_bulk_create",
      label: "bulk add by cert",
      payload: { itemIds: addedIds },
    });
  }

  return NextResponse.json({ results, added, failed });
}
