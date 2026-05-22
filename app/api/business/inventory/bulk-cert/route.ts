import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createInventoryItem } from "@/lib/business/actions";

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
  notes?: string | null;
}

function buildTitle(row: BulkCertRowInput): string {
  return [row.year, row.set_name, row.player_name, row.card_number ? `#${row.card_number}` : null, row.grade]
    .filter(Boolean)
    .join(" ")
    .trim();
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

  type InsertOutcome =
    | { cert: string; status: "added"; id: string }
    | { cert: string; status: "failed"; error: string };

  const results: InsertOutcome[] = [];

  for (const row of rows) {
    const cert = typeof row.cert === "string" ? row.cert.trim() : "";
    if (!cert) {
      results.push({ cert: "", status: "failed", error: "Missing cert number" });
      continue;
    }

    try {
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
        notes: row.notes ?? null,
      };

      const item = await createInventoryItem(user.id, payload as any);
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

  return NextResponse.json({ results, added, failed });
}
