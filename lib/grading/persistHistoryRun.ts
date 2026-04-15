import type {
  CardIdentificationResult,
  GradeEstimate,
  GradeEstimatorHistoryRun,
  WorthGradingResult,
} from "@/types";
import { upsertCachedHistoryRun } from "@/lib/grading/gradeEstimatorHistoryCache";
import {
  buildHistoryCacheCardSnapshot,
  buildHistoryCardSnapshot,
  sanitizeHistoryCardSnapshot,
} from "@/lib/grading/historySnapshots";

type PersistGradeEstimatorHistoryRunOptions = {
  jobId: string;
  card: CardIdentificationResult;
  estimate: GradeEstimate;
  postGradingValue?: WorthGradingResult | null;
};

export async function persistGradeEstimatorHistoryRun(
  options: PersistGradeEstimatorHistoryRunOptions
): Promise<GradeEstimatorHistoryRun> {
  const cardSnapshot = buildHistoryCardSnapshot(options.card);
  const cachedCard = await buildHistoryCacheCardSnapshot(cardSnapshot);
  const sanitizedCard = sanitizeHistoryCardSnapshot(cardSnapshot);

  try {
    const response = await fetch("/api/grade-estimator/history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jobId: options.jobId,
        card: sanitizedCard,
        estimate: options.estimate,
        postGradingValue: options.postGradingValue ?? null,
      }),
    });

    const payload = await response.json().catch(() => null);
    const remoteRun =
      response.ok && payload?.run && typeof payload.run === "object"
        ? (payload.run as Partial<GradeEstimatorHistoryRun>)
        : null;

    if (!response.ok) {
      console.warn(
        "Failed to save grade estimator history (remote):",
        payload?.error ?? response.statusText
      );
    }

    const fallbackRun: GradeEstimatorHistoryRun = {
      id: remoteRun?.id ?? `local-grade-run-${options.jobId}`,
      user_id: remoteRun?.user_id ?? "local",
      job_id: options.jobId,
      card: cachedCard,
      estimate: options.estimate,
      post_grading_value: options.postGradingValue ?? null,
      labels: Array.isArray(remoteRun?.labels) ? remoteRun.labels : [],
      actual_grade_psa: remoteRun?.actual_grade_psa ?? null,
      model_version_used:
        remoteRun?.model_version_used ??
        options.estimate.model_version_used ??
        null,
      feature_version_used:
        remoteRun?.feature_version_used ??
        options.estimate.feature_version_used ??
        null,
      created_at: remoteRun?.created_at ?? new Date().toISOString(),
    };

    upsertCachedHistoryRun(fallbackRun);
    return fallbackRun;
  } catch (error) {
    console.warn("Failed to save grade estimator history:", error);

    const fallbackRun: GradeEstimatorHistoryRun = {
      id: `local-grade-run-${options.jobId}`,
      user_id: "local",
      job_id: options.jobId,
      card: cachedCard,
      estimate: options.estimate,
      post_grading_value: options.postGradingValue ?? null,
      created_at: new Date().toISOString(),
    };

    upsertCachedHistoryRun(fallbackRun);
    return fallbackRun;
  }
}
