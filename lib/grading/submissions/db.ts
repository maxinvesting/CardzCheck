import { createClient } from "@/lib/supabase/server";
import { normalizePsaDistribution } from "@/lib/grading/submissions/compute";
import type {
  EstimatedValueByGradeCents,
  GradingSubmissionItemRecord,
  GradingSubmissionRecord,
  PsaDistribution,
} from "@/lib/grading/submissions/types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

function toInt(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.round(parsed);
  }
  return fallback;
}

function toNullableInt(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.round(parsed);
  }
  return null;
}

function toText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => entry.length > 0);
}

function normalizeEstimatedValues(value: unknown): EstimatedValueByGradeCents {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    "10": toNullableInt(record["10"]),
    "9": toNullableInt(record["9"]),
    "8": toNullableInt(record["8"]),
    "7_or_lower": toNullableInt(record["7_or_lower"]),
  };
}

function normalizeDistribution(value: unknown): PsaDistribution {
  const record = value && typeof value === "object" ? (value as Partial<PsaDistribution>) : undefined;
  return normalizePsaDistribution(record);
}

export function toSubmissionRecord(row: Record<string, unknown>): GradingSubmissionRecord {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    name: typeof row.name === "string" ? row.name : "Untitled submission",
    mode: row.mode === "actual" ? "actual" : "mock",
    grader: row.grader === "psa" ? "psa" : "psa",
    status:
      row.status === "ready" ||
      row.status === "shipped" ||
      row.status === "arrived" ||
      row.status === "grading" ||
      row.status === "qa" ||
      row.status === "shipped_back" ||
      row.status === "received" ||
      row.status === "completed"
        ? row.status
        : "draft",
    psa_order_id: toText(row.psa_order_id),
    service_level: toText(row.service_level),
    declared_value_cents: toInt(row.declared_value_cents, 0),
    shipping_cents: toInt(row.shipping_cents, 0),
    insurance_cents: toInt(row.insurance_cents, 0),
    fees_estimate_cents: toInt(row.fees_estimate_cents, 0),
    fees_actual_cents: toNullableInt(row.fees_actual_cents),
    created_at: typeof row.created_at === "string" ? row.created_at : new Date().toISOString(),
    updated_at: typeof row.updated_at === "string" ? row.updated_at : new Date().toISOString(),
  };
}

export function toSubmissionItemRecord(row: Record<string, unknown>): GradingSubmissionItemRecord {
  return {
    id: String(row.id),
    submission_id: String(row.submission_id),
    user_id: String(row.user_id),
    source_type:
      row.source_type === "collection" || row.source_type === "watchlist"
        ? row.source_type
        : "manual",
    source_id: toText(row.source_id),
    title: typeof row.title === "string" ? row.title : "Untitled card",
    quantity: Math.max(1, toInt(row.quantity, 1)),
    cost_basis_cents: toNullableInt(row.cost_basis_cents),
    predicted_distribution: normalizeDistribution(row.predicted_distribution),
    target_grade: toText(row.target_grade),
    estimated_value_by_grade: normalizeEstimatedValues(row.estimated_value_by_grade),
    expected_value_cents: toInt(row.expected_value_cents, 0),
    break_even_grade: toText(row.break_even_grade),
    risk_flags: toStringArray(row.risk_flags),
    actual_grade: toText(row.actual_grade),
    cert_number: toText(row.cert_number),
    created_at: typeof row.created_at === "string" ? row.created_at : new Date().toISOString(),
    updated_at: typeof row.updated_at === "string" ? row.updated_at : new Date().toISOString(),
  };
}

function extractMissingColumn(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const message =
    typeof (error as { message?: unknown }).message === "string"
      ? (error as { message: string }).message
      : "";
  if (!message) return null;

  const quoted = message.match(/Could not find the '([^']+)' column/i);
  if (quoted?.[1]) return quoted[1];

  const postgres = message.match(/column \"([^\"]+)\" of relation/i);
  if (postgres?.[1]) return postgres[1];

  return null;
}

function normalizeCollectionGrade(grader: string, actualGrade: string): string {
  const trimmed = actualGrade.trim();
  if (!trimmed) return actualGrade;
  const upper = trimmed.toUpperCase();
  if (upper.startsWith("PSA ")) return trimmed;
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    return `${grader.toUpperCase()} ${trimmed}`;
  }
  if (upper.startsWith(grader.toUpperCase())) return trimmed;
  return `${grader.toUpperCase()} ${trimmed}`;
}

async function updateCollectionItemWithSchemaFallback(
  supabase: SupabaseServerClient,
  userId: string,
  cardId: string,
  update: Record<string, unknown>
): Promise<void> {
  const payload = { ...update };

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const { error } = await supabase
      .from("collection_items")
      .update(payload)
      .eq("id", cardId)
      .eq("user_id", userId);

    if (!error) {
      return;
    }

    const missingColumn = extractMissingColumn(error);
    if (!missingColumn || !(missingColumn in payload)) {
      throw error;
    }

    delete payload[missingColumn];
  }
}

export async function syncCollectionItemsFromSubmission(
  supabase: SupabaseServerClient,
  options: {
    userId: string;
    grader: string;
    items: GradingSubmissionItemRecord[];
  }
): Promise<{ synced: number; skipped: number }> {
  let synced = 0;
  let skipped = 0;

  for (const item of options.items) {
    if (item.source_type !== "collection" || !item.source_id || !item.actual_grade) {
      skipped += 1;
      continue;
    }

    try {
      await updateCollectionItemWithSchemaFallback(supabase, options.userId, item.source_id, {
        grade: normalizeCollectionGrade(options.grader, item.actual_grade),
        grading_company: options.grader.toUpperCase(),
        cert_number: item.cert_number ?? null,
      });
      synced += 1;
    } catch (error) {
      console.error("Failed to sync collection item from submission:", {
        itemId: item.id,
        sourceId: item.source_id,
        error,
      });
      skipped += 1;
    }
  }

  return { synced, skipped };
}
