import type { GradeEstimatorHistoryCardSnapshot, GradeEstimatorHistoryRun } from "@/types";

const HISTORY_CACHE_KEY = "gradeEstimatorHistoryRuns";
const HISTORY_CACHE_LIMIT = 25;
const MAX_DATA_URL_LENGTH = 60000;

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function safeParseRuns(raw: string | null): GradeEstimatorHistoryRun[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((run) => run && typeof run === "object");
  } catch {
    return [];
  }
}

function isDataUrl(value: string): boolean {
  return value.startsWith("data:");
}

function isAllowedDataUrl(value: string): boolean {
  return isDataUrl(value) && value.length <= MAX_DATA_URL_LENGTH;
}

function selectHistoryImage(card: GradeEstimatorHistoryCardSnapshot): string | undefined {
  const direct = typeof card.imageUrl === "string" ? card.imageUrl.trim() : "";
  if (direct && (!isDataUrl(direct) || isAllowedDataUrl(direct))) {
    return direct;
  }
  if (Array.isArray(card.imageUrls)) {
    const fallback = card.imageUrls.find(
      (url) => {
        if (typeof url !== "string") return false;
        const trimmed = url.trim();
        return trimmed && (!isDataUrl(trimmed) || isAllowedDataUrl(trimmed));
      }
    );
    return fallback?.trim();
  }
  return undefined;
}

function sanitizeHistoryCard(
  card: GradeEstimatorHistoryCardSnapshot
): GradeEstimatorHistoryCardSnapshot {
  const imageUrl = selectHistoryImage(card);
  const sanitized: GradeEstimatorHistoryCardSnapshot = { ...card };
  if (imageUrl) {
    sanitized.imageUrl = imageUrl;
  } else {
    delete sanitized.imageUrl;
  }
  delete sanitized.imageUrls;
  return sanitized;
}

function stripImagesFromRuns(
  runs: GradeEstimatorHistoryRun[]
): GradeEstimatorHistoryRun[] {
  return runs.map((run) => ({
    ...run,
    card: { ...run.card, imageUrl: undefined, imageUrls: undefined },
  }));
}

function persistHistoryRuns(runs: GradeEstimatorHistoryRun[]) {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(HISTORY_CACHE_KEY, JSON.stringify(runs));
  } catch {
    try {
      window.localStorage.removeItem(HISTORY_CACHE_KEY);
      window.localStorage.setItem(
        HISTORY_CACHE_KEY,
        JSON.stringify(stripImagesFromRuns(runs))
      );
    } catch {
      // Ignore storage failures.
    }
  }
}

export function loadCachedHistoryRuns(): GradeEstimatorHistoryRun[] {
  if (!isBrowser()) return [];
  const raw = window.localStorage.getItem(HISTORY_CACHE_KEY);
  const runs = safeParseRuns(raw).map((run) => {
    if (!run?.card || typeof run.card !== "object") return run;
    return { ...run, card: sanitizeHistoryCard(run.card) };
  });
  return runs.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

export function upsertCachedHistoryRun(
  run: GradeEstimatorHistoryRun
): GradeEstimatorHistoryRun[] {
  if (!isBrowser()) return [];
  const sanitizedRun: GradeEstimatorHistoryRun = {
    ...run,
    card: sanitizeHistoryCard(run.card),
  };
  const existing = loadCachedHistoryRuns();
  const byJob = new Map(existing.map((item) => [item.job_id, item]));
  byJob.set(sanitizedRun.job_id, sanitizedRun);
  const merged = Array.from(byJob.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  const limited = merged.slice(0, HISTORY_CACHE_LIMIT);
  persistHistoryRuns(limited);
  return limited;
}

export function removeCachedHistoryRun(runId: string): GradeEstimatorHistoryRun[] {
  if (!isBrowser()) return [];
  const existing = loadCachedHistoryRuns();
  const filtered = existing.filter((run) => run.id !== runId);
  persistHistoryRuns(filtered);
  return filtered;
}

export function mergeHistoryRuns(
  remote: GradeEstimatorHistoryRun[],
  local: GradeEstimatorHistoryRun[]
): GradeEstimatorHistoryRun[] {
  const byJob = new Map<string, GradeEstimatorHistoryRun>();
  remote.forEach((run) => byJob.set(run.job_id, run));
  local.forEach((run) => {
    const existing = byJob.get(run.job_id);
    if (!existing) {
      byJob.set(run.job_id, run);
      return;
    }
    const remoteImage = existing.card?.imageUrl?.trim();
    const localImage = run.card?.imageUrl?.trim();
    if (!remoteImage && localImage) {
      byJob.set(run.job_id, {
        ...existing,
        card: { ...existing.card, imageUrl: localImage },
      });
    }
  });
  return Array.from(byJob.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}
