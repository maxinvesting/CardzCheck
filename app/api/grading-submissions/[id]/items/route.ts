import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkLegacyProAccess } from "@/lib/access";
import { isTestMode } from "@/lib/test-mode";
import {
  computeExpectedValueCents,
  fetchEstimatedValueByGradeCents,
  normalizePsaDistribution,
} from "@/lib/grading/submissions/compute";
import { syncCollectionItemsFromSubmission, toSubmissionItemRecord } from "@/lib/grading/submissions/db";
import {
  bulkUpdateReturnedGradesSchema,
  createSubmissionItemsSchema,
} from "@/lib/grading/submissions/schemas";
import {
  buildFeatureUnavailableMessage,
  isSubmissionSchemaMissing,
} from "@/lib/grading/submissions/errors";
import type {
  GradingSubmissionRecord,
  SubmissionCardIdentity,
} from "@/lib/grading/submissions/types";
import type { GradeEstimatorCardInput } from "@/lib/grade-estimator/value";

type CreateItemPayload = {
  source_type: "collection" | "watchlist" | "manual";
  source_id?: string | null;
  title: string;
  quantity: number;
  cost_basis_cents?: number | null;
  predicted_distribution?: Partial<{
    "10": number;
    "9": number;
    "8": number;
    "7_or_lower": number;
  }>;
  target_grade?: string | null;
  card?: SubmissionCardIdentity;
};

type CreateItemsPayload = {
  items: CreateItemPayload[];
};

type BulkReturnedGradesPayload = {
  items: Array<{ id: string; actual_grade: string; cert_number?: string | null }>;
};

function paidUpgradeResponse() {
  return NextResponse.json(
    {
      error: "upgrade_required",
      message: "Submission Builder is a paid feature.",
    },
    { status: 403 }
  );
}

async function loadSubmission(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  submissionId: string
): Promise<GradingSubmissionRecord | null> {
  const { data, error } = await supabase
    .from("grading_submissions")
    .select("*")
    .eq("id", submissionId)
    .eq("user_id", userId)
    .single();

  if (error || !data) return null;

  return {
    id: String(data.id),
    user_id: String(data.user_id),
    name: typeof data.name === "string" ? data.name : "Submission",
    mode: data.mode === "actual" ? "actual" : "mock",
    grader: data.grader === "psa" ? "psa" : "psa",
    status:
      data.status === "ready" ||
      data.status === "shipped" ||
      data.status === "arrived" ||
      data.status === "grading" ||
      data.status === "qa" ||
      data.status === "shipped_back" ||
      data.status === "received" ||
      data.status === "completed"
        ? data.status
        : "draft",
    psa_order_id: typeof data.psa_order_id === "string" ? data.psa_order_id : null,
    service_level: typeof data.service_level === "string" ? data.service_level : null,
    declared_value_cents:
      typeof data.declared_value_cents === "number" ? Math.round(data.declared_value_cents) : 0,
    shipping_cents: typeof data.shipping_cents === "number" ? Math.round(data.shipping_cents) : 0,
    insurance_cents: typeof data.insurance_cents === "number" ? Math.round(data.insurance_cents) : 0,
    fees_estimate_cents:
      typeof data.fees_estimate_cents === "number" ? Math.round(data.fees_estimate_cents) : 0,
    fees_actual_cents:
      typeof data.fees_actual_cents === "number" ? Math.round(data.fees_actual_cents) : null,
    created_at: typeof data.created_at === "string" ? data.created_at : new Date().toISOString(),
    updated_at: typeof data.updated_at === "string" ? data.updated_at : new Date().toISOString(),
  };
}

function toNullableString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toSubmissionCardIdentity(record: Record<string, unknown>): SubmissionCardIdentity | null {
  const player = toNullableString(record.player_name);
  if (!player) return null;
  return {
    player_name: player,
    year: toNullableString(record.year),
    set_name: toNullableString(record.set_name),
    card_number: toNullableString(record.card_number),
    parallel_type: toNullableString(record.parallel_type),
    variation: toNullableString(record.variation),
    insert: toNullableString(record.insert),
  };
}

function toGradeEstimatorCardInput(card: SubmissionCardIdentity): GradeEstimatorCardInput {
  return {
    player_name: card.player_name,
    year: card.year ?? undefined,
    set_name: card.set_name ?? undefined,
    card_number: card.card_number ?? undefined,
    parallel_type: card.parallel_type ?? undefined,
    variation: card.variation ?? undefined,
    insert: card.insert ?? undefined,
  };
}

async function loadSourceCardMaps(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  payloadItems: Array<{ source_type: string; source_id?: string | null }>
) {
  const collectionIds = Array.from(
    new Set(
      payloadItems
        .filter((item) => item.source_type === "collection" && item.source_id)
        .map((item) => String(item.source_id))
    )
  );

  const watchlistIds = Array.from(
    new Set(
      payloadItems
        .filter((item) => item.source_type === "watchlist" && item.source_id)
        .map((item) => String(item.source_id))
    )
  );

  const collectionMap = new Map<string, SubmissionCardIdentity>();
  if (collectionIds.length > 0) {
    const { data } = await supabase
      .from("collection_items")
      .select("id, player_name, year, set_name, card_number, parallel_type, variation, insert")
      .eq("user_id", userId)
      .in("id", collectionIds);

    (data ?? []).forEach((row: Record<string, unknown>) => {
      const identity = toSubmissionCardIdentity(row as Record<string, unknown>);
      if (!identity) return;
      collectionMap.set(String((row as { id?: unknown }).id), identity);
    });
  }

  const watchlistMap = new Map<string, SubmissionCardIdentity>();
  if (watchlistIds.length > 0) {
    const { data } = await supabase
      .from("watchlist")
      .select("id, player_name, year, set_brand, card_number, parallel_variant")
      .eq("user_id", userId)
      .in("id", watchlistIds);

    (data ?? []).forEach((row: Record<string, unknown>) => {
      const rowRecord = row as Record<string, unknown>;
      const player = toNullableString(rowRecord.player_name);
      if (!player) return;
      watchlistMap.set(String(rowRecord.id), {
        player_name: player,
        year: toNullableString(rowRecord.year),
        set_name: toNullableString(rowRecord.set_brand),
        card_number: toNullableString(rowRecord.card_number),
        parallel_type: toNullableString(rowRecord.parallel_variant),
        variation: null,
        insert: null,
      });
    });
  }

  return { collectionMap, watchlistMap };
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    if (isTestMode()) {
      const now = new Date().toISOString();
      return NextResponse.json({
        items: [
          {
            id: `test-item-${Date.now()}`,
            submission_id: id,
            user_id: "test-user",
            source_type: "manual",
            source_id: null,
            title: "Test card",
            quantity: 1,
            cost_basis_cents: 0,
            predicted_distribution: {
              "10": 0.08,
              "9": 0.34,
              "8": 0.36,
              "7_or_lower": 0.22,
            },
            target_grade: null,
            estimated_value_by_grade: {
              "10": null,
              "9": null,
              "8": null,
              "7_or_lower": null,
            },
            expected_value_cents: 0,
            break_even_grade: null,
            risk_flags: ["value_unavailable"],
            actual_grade: null,
            cert_number: null,
            created_at: now,
            updated_at: now,
          },
        ],
      });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const isPaidUser = await checkLegacyProAccess(user.id);
    if (!isPaidUser) {
      return paidUpgradeResponse();
    }

    const submission = await loadSubmission(supabase, user.id, id);
    if (!submission) {
      return NextResponse.json({ error: "Submission not found" }, { status: 404 });
    }

    const body = await request.json();
    const parsed = createSubmissionItemsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid payload",
          details: parsed.error.flatten(),
        },
        { status: 400 }
      );
    }

    const payload = parsed.data as CreateItemsPayload;

    const { collectionMap, watchlistMap } = await loadSourceCardMaps(
      supabase,
      user.id,
      payload.items
    );

    const insertRows = await Promise.all(
      payload.items.map(async (item: CreateItemPayload) => {
        const predicted = normalizePsaDistribution(item.predicted_distribution);
        const riskFlags = new Set<string>();

        if (!item.predicted_distribution) {
          riskFlags.add("distribution_defaulted");
        }

        const cardIdentity: SubmissionCardIdentity | null =
          item.card ??
          (item.source_type === "collection" && item.source_id
            ? collectionMap.get(item.source_id) ?? null
            : item.source_type === "watchlist" && item.source_id
            ? watchlistMap.get(item.source_id) ?? null
            : null);

        const estimatedValues = cardIdentity
          ? await fetchEstimatedValueByGradeCents(toGradeEstimatorCardInput(cardIdentity))
          : {
              values: {
                "10": null,
                "9": null,
                "8": null,
                "7_or_lower": null,
              },
              hasUnavailable: true,
            };

        if (estimatedValues.hasUnavailable) {
          riskFlags.add("value_unavailable");
        }

        const costBasis = item.cost_basis_cents ?? null;
        const expectedValueCents = computeExpectedValueCents(predicted, estimatedValues.values);

        return {
          submission_id: id,
          user_id: user.id,
          source_type: item.source_type,
          source_id: item.source_id ?? null,
          title: item.title,
          quantity: item.quantity,
          cost_basis_cents: costBasis,
          predicted_distribution: predicted,
          target_grade: item.target_grade ?? null,
          estimated_value_by_grade: estimatedValues.values,
          expected_value_cents: expectedValueCents,
          break_even_grade: null,
          risk_flags: Array.from(riskFlags),
          actual_grade: null,
          cert_number: null,
        };
      })
    );

    const { data: insertedRows, error: insertError } = await supabase
      .from("grading_submission_items")
      .insert(insertRows)
      .select("*");

    if (insertError) {
      if (isSubmissionSchemaMissing(insertError)) {
        return NextResponse.json(
          {
            error: "feature_unavailable",
            message: buildFeatureUnavailableMessage(),
          },
          { status: 503 }
        );
      }
      console.error("Failed to insert submission items:", insertError);
      return NextResponse.json(
        { error: "Failed to add items" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      items: (insertedRows ?? []).map((row: Record<string, unknown>) =>
        toSubmissionItemRecord(row)
      ),
    });
  } catch (error) {
    if (isSubmissionSchemaMissing(error)) {
      return NextResponse.json(
        {
          error: "feature_unavailable",
          message: buildFeatureUnavailableMessage(),
        },
        { status: 503 }
      );
    }
    console.error("Submission items POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    if (isTestMode()) {
      return NextResponse.json({ updated: 0, sync: { synced: 0, skipped: 0 } });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const isPaidUser = await checkLegacyProAccess(user.id);
    if (!isPaidUser) {
      return paidUpgradeResponse();
    }

    const submission = await loadSubmission(supabase, user.id, id);
    if (!submission) {
      return NextResponse.json({ error: "Submission not found" }, { status: 404 });
    }

    if (submission.mode !== "actual") {
      return NextResponse.json(
        { error: "Bulk grade updates are only available for actual submissions" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const parsed = bulkUpdateReturnedGradesSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid payload",
          details: parsed.error.flatten(),
        },
        { status: 400 }
      );
    }

    const payload = parsed.data as BulkReturnedGradesPayload;

    const updates = await Promise.all(
      payload.items.map(async (item: { id: string; actual_grade: string; cert_number?: string | null }) => {
        const { data, error } = await supabase
          .from("grading_submission_items")
          .update({
            actual_grade: item.actual_grade,
            cert_number: item.cert_number ?? null,
          })
          .eq("id", item.id)
          .eq("submission_id", id)
          .eq("user_id", user.id)
          .select("*")
          .single();

        if (error || !data) {
          return null;
        }

        return toSubmissionItemRecord(data as Record<string, unknown>);
      })
    );

    const updatedItems = updates.filter(
      (item): item is Exclude<(typeof updates)[number], null> => item !== null
    );
    let sync: { synced: number; skipped: number } | null = null;

    if (submission.status === "received" || submission.status === "completed") {
      sync = await syncCollectionItemsFromSubmission(supabase, {
        userId: user.id,
        grader: submission.grader,
        items: updatedItems,
      });
    }

    return NextResponse.json({
      updated: updatedItems.length,
      items: updatedItems,
      sync,
    });
  } catch (error) {
    if (isSubmissionSchemaMissing(error)) {
      return NextResponse.json(
        {
          error: "feature_unavailable",
          message: buildFeatureUnavailableMessage(),
        },
        { status: 503 }
      );
    }
    console.error("Submission items PATCH error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
