import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isTestMode } from "@/lib/test-mode";
import type { GradeEstimatorHistoryRun } from "@/types";
import {
  isGradeScanPhotoKind,
  normalizeGradeScanPhotos,
} from "@/lib/grading/scanPhotos";

const MAX_GRADE_ESTIMATOR_RUNS = 25;

function isDataUrl(value?: string | null): boolean {
  if (!value) return false;
  return value.trim().startsWith("data:");
}

function sanitizeHistoryCard(
  card: Record<string, unknown> | null | undefined
): Record<string, unknown> | null | undefined {
  if (!card || typeof card !== "object") return card;
  const imageUrl =
    typeof card.imageUrl === "string" && !isDataUrl(card.imageUrl)
      ? card.imageUrl.trim()
      : undefined;
  const imageUrls = Array.isArray(card.imageUrls)
    ? card.imageUrls.filter(
        (url) => typeof url === "string" && url.trim() && !isDataUrl(url)
      )
    : [];
  const sanitized = { ...card } as Record<string, unknown>;
  if (imageUrl) {
    sanitized.imageUrl = imageUrl;
  } else if (imageUrls.length > 0) {
    sanitized.imageUrl = imageUrls[0]?.trim();
  } else {
    delete sanitized.imageUrl;
  }
  // Preserve imageUrls (front + back) for stacked display; omit data URLs to keep payload small
  sanitized.imageUrls = imageUrls.length > 0 ? imageUrls : undefined;

  const rawScanPhotos = normalizeGradeScanPhotos(
    (sanitized as { scanPhotos?: unknown }).scanPhotos
  )
    .filter((photo) => !isDataUrl(photo.url))
    .map((photo, index) => ({
      url: photo.url,
      kind: isGradeScanPhotoKind(photo.kind) ? photo.kind : "other",
      sort_order: index,
    }));
  sanitized.scanPhotos = rawScanPhotos.length > 0 ? rawScanPhotos : undefined;
  return sanitized;
}

// GET /api/grade-estimator/history - Get user's recent grade estimator runs
export async function GET() {
  try {
    if (isTestMode()) {
      return NextResponse.json({ runs: [] });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: runs, error } = await supabase
      .from("grade_estimator_runs")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(MAX_GRADE_ESTIMATOR_RUNS);

    if (error) {
      console.error("Error fetching grade estimator runs:", error);
      return NextResponse.json(
        { error: "Failed to fetch grade estimator runs" },
        { status: 500 }
      );
    }

    const runRows = (runs ?? []) as GradeEstimatorHistoryRun[];
    const runIds = runRows.map((run) => run.id).filter((id) => typeof id === "string");
    let photoByScanId = new Map<string, Array<{ url: string; kind: string; sort_order: number }>>();

    if (runIds.length > 0) {
      try {
        const { data: photos, error: photoError } = await supabase
          .from("grade_scan_photos")
          .select("scan_id,url,kind,sort_order")
          .in("scan_id", runIds)
          .order("sort_order", { ascending: true });

        if (!photoError && Array.isArray(photos)) {
          photoByScanId = photos.reduce((map, photo) => {
            const key = typeof photo.scan_id === "string" ? photo.scan_id : "";
            if (!key) return map;
            const row = map.get(key) ?? [];
            row.push({
              url: typeof photo.url === "string" ? photo.url : "",
              kind: typeof photo.kind === "string" ? photo.kind : "other",
              sort_order:
                typeof photo.sort_order === "number" && Number.isFinite(photo.sort_order)
                  ? Math.round(photo.sort_order)
                  : row.length,
            });
            map.set(key, row);
            return map;
          }, new Map<string, Array<{ url: string; kind: string; sort_order: number }>>());
        }
      } catch {
        // Ignore if migration has not been applied yet.
      }
    }

    const runsWithPhotos = runRows.map((run) => {
      const card = sanitizeHistoryCard(
        run.card as unknown as Record<string, unknown> | null | undefined
      ) as Record<string, unknown> | null | undefined;
      const normalizedCard = (card ?? run.card ?? {}) as Record<string, unknown>;
      const tablePhotos = photoByScanId.get(run.id) ?? [];
      const rowScanPhotos = normalizeGradeScanPhotos(
        (run as { scan_photos?: unknown }).scan_photos
      );
      if (rowScanPhotos.length > 0 && !Array.isArray(normalizedCard.scanPhotos)) {
        normalizedCard.scanPhotos = rowScanPhotos;
      }
      if (tablePhotos.length > 0 && !Array.isArray(normalizedCard.scanPhotos)) {
        normalizedCard.scanPhotos = tablePhotos;
      }
      return {
        ...run,
        card: normalizedCard,
      };
    });

    return NextResponse.json({ runs: runsWithPhotos });
  } catch (error) {
    console.error("Grade estimator history GET error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE /api/grade-estimator/history - Delete a grade estimator run by id
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const runId = searchParams.get("id");

    if (!runId || typeof runId !== "string") {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    if (isTestMode()) {
      return NextResponse.json({ success: true });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { error } = await supabase
      .from("grade_estimator_runs")
      .delete()
      .eq("id", runId)
      .eq("user_id", user.id);

    if (error) {
      console.error("Error deleting grade estimator run:", error);
      return NextResponse.json(
        { error: "Failed to delete grade estimator run" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Grade estimator history DELETE error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/grade-estimator/history - Save a new grade estimator run
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { jobId, card, estimate, postGradingValue } = body ?? {};
    const sanitizedCard = sanitizeHistoryCard(card);

    if (!jobId || typeof jobId !== "string") {
      return NextResponse.json({ error: "jobId is required" }, { status: 400 });
    }

    if (
      !sanitizedCard ||
      typeof sanitizedCard.player_name !== "string"
    ) {
      return NextResponse.json(
        { error: "card.player_name is required" },
        { status: 400 }
      );
    }

    if (
      typeof estimate?.estimated_grade_low !== "number" ||
      typeof estimate?.estimated_grade_high !== "number"
    ) {
      return NextResponse.json(
        { error: "estimate is required" },
        { status: 400 }
      );
    }

    if (isTestMode()) {
      return NextResponse.json({
        run: {
          id: `test-grade-run-${Date.now()}`,
          user_id: "test-user",
          job_id: jobId,
          card: sanitizedCard,
          estimate,
          post_grading_value: postGradingValue ?? null,
          created_at: new Date().toISOString(),
        },
      });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: run, error } = await supabase
      .from("grade_estimator_runs")
      .upsert(
        {
          user_id: user.id,
          job_id: jobId,
          card: sanitizedCard,
          scan_photos: normalizeGradeScanPhotos(
            (sanitizedCard as { scanPhotos?: unknown } | null)?.scanPhotos
          ),
          estimate,
          post_grading_value: postGradingValue ?? null,
        },
        { onConflict: "user_id,job_id" }
      )
      .select()
      .single();

    if (error) {
      console.error("Error saving grade estimator run:", error);
      return NextResponse.json(
        { error: "Failed to save grade estimator run" },
        { status: 500 }
      );
    }

    const scanPhotos = normalizeGradeScanPhotos(
      (sanitizedCard as { scanPhotos?: unknown } | null)?.scanPhotos
    )
      .filter((photo) => !isDataUrl(photo.url))
      .map((photo, index) => ({
        scan_id: run.id,
        user_id: user.id,
        url: photo.url,
        kind: photo.kind,
        sort_order: index,
      }));

    if (scanPhotos.length > 0) {
      try {
        await supabase.from("grade_scan_photos").delete().eq("scan_id", run.id).eq("user_id", user.id);
        const { error: photoInsertError } = await supabase.from("grade_scan_photos").insert(scanPhotos);
        if (photoInsertError) {
          console.warn("Failed to persist grade scan photos:", photoInsertError.message);
        }
      } catch {
        // Ignore when grade_scan_photos table is unavailable.
      }
    }

    return NextResponse.json({ run });
  } catch (error) {
    console.error("Grade estimator history POST error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
