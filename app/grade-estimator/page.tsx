"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import AuthenticatedLayout from "@/components/AuthenticatedLayout";
import DualCardUploader from "@/components/DualCardUploader";
import GradeProbabilityPanel from "@/components/grading/GradeProbabilityPanel";
import GradeEstimateProgressPanel from "@/components/grading/GradeEstimateProgressPanel";
import GradeEstimatorValuePanel from "@/components/GradeEstimatorValuePanel";
import GradeEstimatorHistoryPanel from "@/components/grading/GradeEstimatorHistoryPanel";
import { GradeScanLabelPanel } from "@/components/grading/GradeScanLabelPanel";
import SubmissionBuilderPanel from "@/components/grading/SubmissionBuilderPanel";
import GradeAnalysisAnimation from "@/components/grading/GradeAnalysisAnimation";
import ConfirmAddCardModal from "@/components/ConfirmAddCardModal";
import PaywallModal from "@/components/PaywallModal";
import { gradingCopy } from "@/copy/grading";
import { useAuth } from "@/contexts/AuthContext";
import { upsertCachedHistoryRun } from "@/lib/grading/gradeEstimatorHistoryCache";
import {
  CardIdentitySubtitle,
  ConfidenceBadge,
  NeedsConfirmationPill,
  InlineNotice,
} from "@/components/ui";
import { Surface } from "@/components/ui/Surface";
import { needsYearConfirmation } from "@/lib/card-identity/ui";
import type {
  CardIdentificationResult,
  GradeEstimate,
  WorthGradingResult,
  GradeEstimatorHistoryRun,
  GradeEstimatorHistoryCardSnapshot,
  GradeScanPhoto,
} from "@/types";
import type {
  GradeEstimateJobStatusResponse,
  GradeEstimateJobSteps,
} from "@/lib/grading/gradeEstimateJob";
import { confidencePillClasses } from "@/theme/tokens";
import { normalizeGradeScanPhotos } from "@/lib/grading/scanPhotos";

const HISTORY_CARD_STORAGE_KEY = "gradeEstimateHistoryCard";

type StoredHistoryCard = {
  jobId: string;
  card: GradeEstimatorHistoryCardSnapshot;
};

function isDataUrl(value?: string | null): boolean {
  if (!value) return false;
  return value.trim().startsWith("data:");
}

function sanitizeScanPhotosForHistory(
  photos?: GradeScanPhoto[],
  options?: { allowDataUrls?: boolean }
): GradeScanPhoto[] | undefined {
  const allowDataUrls = options?.allowDataUrls ?? false;
  const sanitized = normalizeGradeScanPhotos(photos)
    .filter((photo) => {
      if (!photo.url?.trim()) return false;
      if (allowDataUrls) return true;
      return !isDataUrl(photo.url);
    })
    .map((photo, index) => ({
      url: photo.url.trim(),
      kind: photo.kind,
      sort_order: index,
    }));
  return sanitized.length > 0 ? sanitized : undefined;
}

async function downscaleDataUrl(
  dataUrl: string,
  options: { maxWidth: number; maxHeight: number; quality?: number }
): Promise<string | null> {
  if (typeof window === "undefined") return null;
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(
        1,
        options.maxWidth / image.width,
        options.maxHeight / image.height
      );
      const width = Math.max(1, Math.round(image.width * scale));
      const height = Math.max(1, Math.round(image.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(null);
        return;
      }
      ctx.drawImage(image, 0, 0, width, height);
      resolve(
        canvas.toDataURL("image/jpeg", options.quality ?? 0.7)
      );
    };
    image.onerror = () => resolve(null);
    image.src = dataUrl;
  });
}

async function buildHistoryCacheCardSnapshot(
  card: GradeEstimatorHistoryCardSnapshot
): Promise<GradeEstimatorHistoryCardSnapshot> {
  const direct = card.imageUrl?.trim() ?? "";
  const fallback = card.imageUrls?.find((url) => url && url.trim())?.trim();
  const source = direct || fallback;
  if (!source) {
    const sanitized = { ...card };
    delete sanitized.imageUrl;
    delete sanitized.imageUrls;
    sanitized.scanPhotos = sanitizeScanPhotosForHistory(card.scanPhotos, {
      allowDataUrls: false,
    });
    return sanitized;
  }
  if (!isDataUrl(source)) {
    return {
      ...card,
      imageUrl: source,
      imageUrls: undefined,
      scanPhotos: sanitizeScanPhotosForHistory(card.scanPhotos, {
        allowDataUrls: false,
      }),
    };
  }
  const thumbnail = await downscaleDataUrl(source, {
    maxWidth: 120,
    maxHeight: 168,
    quality: 0.7,
  });
  if (!thumbnail) {
    const sanitized = { ...card };
    delete sanitized.imageUrl;
    delete sanitized.imageUrls;
    sanitized.scanPhotos = sanitizeScanPhotosForHistory(card.scanPhotos, {
      allowDataUrls: false,
    });
    return sanitized;
  }
  return {
    ...card,
    imageUrl: thumbnail,
    imageUrls: undefined,
    scanPhotos: sanitizeScanPhotosForHistory(card.scanPhotos, {
      allowDataUrls: false,
    }),
  };
}

function sanitizeHistoryCardSnapshot(
  card: GradeEstimatorHistoryCardSnapshot
): GradeEstimatorHistoryCardSnapshot {
  const direct = card.imageUrl && !isDataUrl(card.imageUrl) ? card.imageUrl.trim() : "";
  const fallback = !direct
    ? card.imageUrls?.find((url) => url && !isDataUrl(url))?.trim()
    : undefined;
  const sanitized: GradeEstimatorHistoryCardSnapshot = { ...card };
  if (direct || fallback) {
    sanitized.imageUrl = direct || fallback;
  } else {
    delete sanitized.imageUrl;
  }
  sanitized.scanPhotos = sanitizeScanPhotosForHistory(card.scanPhotos, {
    allowDataUrls: false,
  });
  delete sanitized.imageUrls;
  return sanitized;
}

function readStoredHistoryCard(jobId?: string | null): GradeEstimatorHistoryCardSnapshot | null {
  if (!jobId || typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(HISTORY_CARD_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredHistoryCard;
    if (!parsed?.jobId || parsed.jobId !== jobId) return null;
    return parsed.card ?? null;
  } catch {
    return null;
  }
}

function writeStoredHistoryCard(jobId: string, card: GradeEstimatorHistoryCardSnapshot) {
  if (typeof window === "undefined") return;
  try {
    const payload: StoredHistoryCard = { jobId, card };
    sessionStorage.setItem(HISTORY_CARD_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage failures
  }
}

function clearStoredHistoryCard(jobId?: string | null) {
  if (!jobId || typeof window === "undefined") return;
  const raw = sessionStorage.getItem(HISTORY_CARD_STORAGE_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw) as StoredHistoryCard;
    if (parsed?.jobId === jobId) {
      sessionStorage.removeItem(HISTORY_CARD_STORAGE_KEY);
    }
  } catch {
    sessionStorage.removeItem(HISTORY_CARD_STORAGE_KEY);
  }
}

const SCANNER_TIPS = [
  "Use flat, even lighting — avoid glare, shadows, or direct flash.",
  "Include both front and back for the most accurate analysis.",
  "Add close-ups for corners, edges, and surface to improve confidence.",
  "Fill the frame and keep the card sharp — blurry edges reduce confidence.",
];

// ── Scanner Tips module ────────────────────────────────────────────────────
function ScannerTips() {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex items-start gap-3">
      {/* Icon */}
      <svg
        className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--muted)]"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>

      <div className="flex-1 min-w-0">
        <button
          onClick={() => setOpen((prev) => !prev)}
          className="group flex items-center gap-1.5 text-xs text-[var(--muted)] transition-colors hover:text-[var(--biz-text)]"
        >
          <span className="font-medium">Scanner tips</span>
          <svg
            className={`w-3 h-3 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {open ? (
          <ul className="mt-2 space-y-1.5">
            {SCANNER_TIPS.map((tip, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-[var(--muted)]">
                <span className="mt-px shrink-0 font-mono text-[10px] text-[var(--muted)]">
                  {String(i + 1).padStart(2, "0")}
                </span>
                {tip}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

export default function GradeEstimatorPage() {
  const { authUser, loading: authLoading } = useAuth();
  const [identifiedCard, setIdentifiedCard] = useState<CardIdentificationResult | null>(null);
  const [gradeEstimate, setGradeEstimate] = useState<GradeEstimate | null>(null);
  const [estimatingGrade, setEstimatingGrade] = useState(false);
  const [estimateAttempted, setEstimateAttempted] = useState(false);
  const [estimateError, setEstimateError] = useState<string | null>(null);
  const [valueResult, setValueResult] = useState<WorthGradingResult | null>(null);
  const [valueLoading, setValueLoading] = useState(false);
  const [valueError, setValueError] = useState<string | null>(null);
  const [gradeJob, setGradeJob] = useState<GradeEstimateJobStatusResponse | null>(null);
  const [gradeJobId, setGradeJobId] = useState<string | null>(null);
  const [jobStartTime, setJobStartTime] = useState<number | null>(null);
  const [elapsedLabel, setElapsedLabel] = useState<string | null>(null);
  const [showMarketAnalysis, setShowMarketAnalysis] = useState(false);
  const [showAnimation, setShowAnimation] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [showSubmissionBuilder, setShowSubmissionBuilder] = useState(false);
  const [toast, setToast] = useState<{ type: "success"; message: string } | null>(null);
  const [historyRefreshToken, setHistoryRefreshToken] = useState(0);
  const [lastSavedJobId, setLastSavedJobId] = useState<string | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [labelsEnabledByRole, setLabelsEnabledByRole] = useState(false);
  const labelsEnabledByEnv =
    process.env.NEXT_PUBLIC_ENABLE_GRADING_LABELS === "true";
  const gradingLabelsEnabled = labelsEnabledByEnv || labelsEnabledByRole;

  const buildQueuedSteps = (): GradeEstimateJobSteps => ({
    ocr_identity: { status: "queued" },
    grade_model: { status: "queued" },
    parse_validate: { status: "queued" },
    post_grading_value: { status: "queued" },
  });

  const buildHistoryCardSnapshot = useCallback(
    (card: CardIdentificationResult): GradeEstimatorHistoryCardSnapshot => ({
      player_name: card.player_name,
      year: card.year,
      set_name: card.set_name,
      card_number: card.card_number,
      parallel_type: card.parallel_type,
      variation: card.variation,
      insert: card.insert,
      grade: card.grade,
      imageUrl: card.imageUrl,
      imageUrls: card.imageUrls,
      scanPhotos: card.scanPhotos,
      confidence: card.confidence,
    }),
    []
  );

  const handleReset = () => {
    setIdentifiedCard(null);
    setGradeEstimate(null);
    setEstimatingGrade(false);
    setEstimateAttempted(false);
    setEstimateError(null);
    setValueResult(null);
    setValueLoading(false);
    setValueError(null);
    setGradeJob(null);
    setGradeJobId(null);
    setJobStartTime(null);
    setElapsedLabel(null);
    setShowMarketAnalysis(false);
    setShowAnimation(false);
    setActiveRunId(null);
    if (typeof window !== "undefined") {
      sessionStorage.removeItem("gradeEstimateJobId");
      sessionStorage.removeItem("gradeEstimateJobStart");
    }
  };

  const saveHistoryRun = useCallback(
    async (options: {
      jobId: string;
      card: CardIdentificationResult;
      estimate: GradeEstimate;
      postGradingValue?: WorthGradingResult | null;
    }): Promise<boolean> => {
      const cardSnapshot = buildHistoryCardSnapshot(options.card);
      const cachedCard = await buildHistoryCacheCardSnapshot(cardSnapshot);
      const sanitizedCard = sanitizeHistoryCardSnapshot(cardSnapshot);
      if (!authUser && !authLoading) {
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
        setLastSavedJobId(options.jobId);
        setActiveRunId(fallbackRun.id);
        setHistoryRefreshToken((prev) => prev + 1);
        return true;
      }
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
        const run =
          response.ok && payload?.run
            ? (payload.run as GradeEstimatorHistoryRun)
            : null;
        if (!response.ok) {
          console.warn(
            "Failed to save grade estimator history (remote):",
            payload?.error ?? response.statusText
          );
        }

        const fallbackRun: GradeEstimatorHistoryRun = {
          id: run?.id ?? `local-grade-run-${options.jobId}`,
          user_id: run?.user_id ?? "local",
          job_id: options.jobId,
          card: cachedCard,
          estimate: options.estimate,
          post_grading_value: options.postGradingValue ?? null,
          created_at: run?.created_at ?? new Date().toISOString(),
        };

        upsertCachedHistoryRun(fallbackRun);
        setLastSavedJobId(options.jobId);
        setActiveRunId(fallbackRun.id);
        setHistoryRefreshToken((prev) => prev + 1);
        return true;
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
        setLastSavedJobId(options.jobId);
        setActiveRunId(fallbackRun.id);
        setHistoryRefreshToken((prev) => prev + 1);
        return true;
      }
    },
    [authLoading, authUser, buildHistoryCardSnapshot]
  );

  const handleHistorySelect = useCallback((run: GradeEstimatorHistoryRun) => {
    const fallbackImageUrls =
      run.card.imageUrls && run.card.imageUrls.length > 0
        ? run.card.imageUrls
        : run.card.scanPhotos?.map((photo) => photo.url) ?? [];
    const imageUrl = run.card.imageUrl || fallbackImageUrls[0] || "";
    setIdentifiedCard({
      player_name: run.card.player_name,
      year: run.card.year,
      set_name: run.card.set_name,
      card_number: run.card.card_number,
      parallel_type: run.card.parallel_type,
      variation: run.card.variation,
      insert: run.card.insert,
      grade: run.card.grade,
      imageUrl,
      imageUrls: fallbackImageUrls.length > 0 ? fallbackImageUrls : undefined,
      scanPhotos: run.card.scanPhotos,
      confidence: run.card.confidence ?? "medium",
    });
    setGradeEstimate(run.estimate);
    setValueResult(run.post_grading_value ?? null);
    setValueLoading(false);
    setValueError(null);
    setEstimateError(null);
    setEstimateAttempted(true);
    setEstimatingGrade(false);
    setGradeJob(null);
    setGradeJobId(null);
    setJobStartTime(null);
    setElapsedLabel(null);
    setShowMarketAnalysis(false);
    setShowAnimation(false);
    setActiveRunId(run.id);
    if (typeof window !== "undefined") {
      sessionStorage.removeItem("gradeEstimateJobId");
      sessionStorage.removeItem("gradeEstimateJobStart");
    }
  }, []);

  const handleEstimateGrade = async () => {
    const fallbackImageUrls = identifiedCard?.imageUrls?.length
      ? identifiedCard.imageUrls
      : identifiedCard?.imageUrl
      ? [identifiedCard.imageUrl]
      : [];
    const fallbackScanPhotos = fallbackImageUrls.map((url, index): GradeScanPhoto => ({
      url,
      kind: index === 0 ? "front" : index === 1 ? "back" : "other",
      sort_order: index,
    }));
    const scanPhotos = normalizeGradeScanPhotos(
      identifiedCard?.scanPhotos?.length
        ? identifiedCard.scanPhotos
        : fallbackScanPhotos
    );
    const frontPhoto = scanPhotos.find((photo) => photo.kind === "front");
    const backPhoto = scanPhotos.find((photo) => photo.kind === "back");
    const closeups = scanPhotos.filter(
      (photo) => photo.kind !== "front" && photo.kind !== "back"
    );
    if (!frontPhoto || !backPhoto) {
      setEstimateError("Front and back photos are required before analysis.");
      return;
    }

    setEstimatingGrade(true);
    setEstimateAttempted(true);
    setEstimateError(null);
    setGradeEstimate(null);
    setValueResult(null);
    setValueLoading(false);
    setValueError(null);
    setGradeJob(null);
    setGradeJobId(null);
    setJobStartTime(null);
    setElapsedLabel(null);
    setShowMarketAnalysis(false);
    setShowAnimation(true);
    setActiveRunId(null);
    try {
      const response = await fetch("/api/grade-estimate/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          front_url: frontPhoto.url,
          back_url: backPhoto.url,
          closeups: closeups.map((photo, index) => ({
            url: photo.url,
            kind: photo.kind,
            sort_order: index,
          })),
          scanPhotos: scanPhotos.map((photo, index) => ({
            ...photo,
            sort_order: index,
          })),
          card: identifiedCard
            ? {
                player_name: identifiedCard.player_name,
                game: identifiedCard.cardIdentity?.sport ?? undefined,
                sport: identifiedCard.cardIdentity?.sport ?? undefined,
                year: identifiedCard.year,
                set_name: identifiedCard.set_name,
                card_number: identifiedCard.card_number,
                parallel_type: identifiedCard.parallel_type,
                variation: identifiedCard.variation,
                insert: identifiedCard.insert,
              }
            : undefined,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        const message =
          payload?.reason || payload?.error || gradingCopy.status.estimateFailedFallback;
        throw new Error(message);
      }

      const payload = await response.json();
      if (!payload?.jobId) {
        throw new Error(gradingCopy.status.estimateFailedFallback);
      }
      const now = Date.now();
      setGradeJobId(payload.jobId);
      setJobStartTime(now);
      if (typeof window !== "undefined") {
        sessionStorage.setItem("gradeEstimateJobId", payload.jobId);
        sessionStorage.setItem("gradeEstimateJobStart", String(now));
      }
      const historyCard = identifiedCard ? buildHistoryCardSnapshot(identifiedCard) : null;
      if (historyCard) {
        writeStoredHistoryCard(payload.jobId, historyCard);
      }
      setGradeJob({
        jobId: payload.jobId,
        status: "queued",
        startedAt: now,
        finishedAt: undefined,
        steps: buildQueuedSteps(),
        partial: {},
        final: null,
        error: null,
      });
      setEstimateError(null);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : gradingCopy.status.estimateFailedFallback;
      setEstimateError(message);
      setGradeEstimate(null);
      setEstimatingGrade(false);
    }
  };

  const fetchValue = useCallback(async () => {
    if (!gradeEstimate?.grade_probabilities || !identifiedCard) return;
    setValueLoading(true);
    setValueError(null);
    try {
      const response = await fetch("/api/grade-estimator/value", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          card: {
            player_name: identifiedCard.player_name,
            game: identifiedCard.cardIdentity?.sport ?? undefined,
            sport: identifiedCard.cardIdentity?.sport ?? undefined,
            year: identifiedCard.year,
            set_name: identifiedCard.set_name,
            card_number: identifiedCard.card_number,
            parallel_type: identifiedCard.parallel_type,
            variation: identifiedCard.variation,
            insert: identifiedCard.insert,
          },
          gradeProbabilities: gradeEstimate.grade_probabilities,
          estimatorConfidence: gradeEstimate.grade_probabilities.confidence,
        }),
      });
      if (!response.ok) {
        throw new Error("POST_GRADING_VALUE_UNAVAILABLE");
      }
      const result: WorthGradingResult = await response.json();
      setValueResult(result);
      setValueError(null);
    } catch {
      setValueResult(null);
      setValueError(gradingCopy.status.postGradingValueFailed);
    } finally {
      setValueLoading(false);
    }
  }, [gradeEstimate, identifiedCard]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (gradeJobId) return;
    const storedJobId = sessionStorage.getItem("gradeEstimateJobId");
    if (storedJobId) {
      setGradeJobId(storedJobId);
      const storedStart = Number(sessionStorage.getItem("gradeEstimateJobStart"));
      if (Number.isFinite(storedStart)) {
        setJobStartTime(storedStart);
      }
    }
  }, [gradeJobId]);

  useEffect(() => {
    if (labelsEnabledByEnv) {
      setLabelsEnabledByRole(false);
      return;
    }
    if (!authUser || authLoading) {
      setLabelsEnabledByRole(false);
      return;
    }

    let cancelled = false;
    const loadRole = async () => {
      try {
        const response = await fetch("/api/user/name", { cache: "no-store" });
        const payload = await response.json().catch(() => null);
        if (cancelled) return;
        const role = typeof payload?.app_role === "string" ? payload.app_role : null;
        setLabelsEnabledByRole(role === "admin" || role === "owner");
      } catch {
        if (!cancelled) {
          setLabelsEnabledByRole(false);
        }
      }
    };

    void loadRole();
    return () => {
      cancelled = true;
    };
  }, [authLoading, authUser, labelsEnabledByEnv]);

  useEffect(() => {
    if (!gradeJobId) return;

    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const poll = async () => {
      try {
        const response = await fetch(`/api/grade-estimate/status?jobId=${gradeJobId}`);
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          const message =
            payload?.error || gradingCopy.status.estimateFailedFallback;
          throw new Error(message);
        }

        const payload: GradeEstimateJobStatusResponse = await response.json();
        if (cancelled) return;

        setGradeJob(payload);
        if (payload.startedAt) {
          setJobStartTime(payload.startedAt);
          if (typeof window !== "undefined") {
            sessionStorage.setItem("gradeEstimateJobStart", String(payload.startedAt));
          }
        }

        if (payload.final?.estimate) {
          setGradeEstimate(payload.final.estimate);
        }

        const postStatus = payload.steps.post_grading_value.status;
        if (postStatus === "running") {
          setValueLoading(true);
        } else if (postStatus === "done") {
          setValueLoading(false);
          setValueError(null);
          if (payload.final?.postGradingValue) {
            setValueResult(payload.final.postGradingValue);
          }
        } else if (postStatus === "error") {
          setValueLoading(false);
          setValueResult(null);
          setValueError(gradingCopy.status.postGradingValueFailed);
        } else if (postStatus === "skipped") {
          setValueLoading(false);
          setValueResult(null);
          setValueError(gradingCopy.status.postGradingValueFailed);
        }

        if (payload.status === "done") {
          setEstimatingGrade(false);
          if (typeof window !== "undefined") {
            sessionStorage.removeItem("gradeEstimateJobId");
            sessionStorage.removeItem("gradeEstimateJobStart");
          }
          if (intervalId) clearInterval(intervalId);
        } else if (payload.status === "error") {
          setEstimatingGrade(false);
          setEstimateError(
            payload.error || gradingCopy.status.estimateFailedFallback
          );
          if (typeof window !== "undefined") {
            sessionStorage.removeItem("gradeEstimateJobId");
            sessionStorage.removeItem("gradeEstimateJobStart");
          }
          if (intervalId) clearInterval(intervalId);
        }
      } catch (error) {
        if (cancelled) return;
        const message =
          error instanceof Error ? error.message : gradingCopy.status.estimateFailedFallback;
        setEstimateError(message);
        setEstimatingGrade(false);
        if (typeof window !== "undefined") {
          sessionStorage.removeItem("gradeEstimateJobId");
          sessionStorage.removeItem("gradeEstimateJobStart");
        }
        if (intervalId) clearInterval(intervalId);
      }
    };

    void poll();
    intervalId = setInterval(poll, 900);

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, [gradeJobId]);

  useEffect(() => {
    if (!gradeJobId || gradeJob?.status !== "done" || !identifiedCard) return;
    if (lastSavedJobId === gradeJobId) return;
    const estimate = gradeJob.final?.estimate ?? gradeEstimate;
    if (!estimate) return;

    void (async () => {
      const saved = await saveHistoryRun({
        jobId: gradeJobId,
        card: identifiedCard,
        estimate,
        postGradingValue: gradeJob.final?.postGradingValue ?? valueResult ?? null,
      });
      if (saved) {
        clearStoredHistoryCard(gradeJobId);
      }
    })();
  }, [
    gradeJobId,
    gradeJob?.status,
    gradeJob?.final,
    identifiedCard,
    gradeEstimate,
    valueResult,
    lastSavedJobId,
    saveHistoryRun,
  ]);

  useEffect(() => {
    if (identifiedCard || !gradeJobId) return;
    const storedCard = readStoredHistoryCard(gradeJobId);
    if (!storedCard) return;
    setIdentifiedCard({
      imageUrl:
        storedCard.imageUrl ||
        storedCard.imageUrls?.[0] ||
        storedCard.scanPhotos?.[0]?.url ||
        "",
      player_name: storedCard.player_name,
      year: storedCard.year,
      set_name: storedCard.set_name,
      card_number: storedCard.card_number,
      parallel_type: storedCard.parallel_type,
      variation: storedCard.variation,
      insert: storedCard.insert,
      grade: storedCard.grade,
      imageUrls:
        storedCard.imageUrls && storedCard.imageUrls.length > 0
          ? storedCard.imageUrls
          : storedCard.scanPhotos?.map((photo) => photo.url),
      scanPhotos: storedCard.scanPhotos,
      confidence: storedCard.confidence ?? "medium",
    });
  }, [gradeJobId, identifiedCard]);

  useEffect(() => {
    if (!jobStartTime) {
      setElapsedLabel(null);
      return;
    }

    const formatElapsed = (elapsedMs: number) => {
      const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    };

    const update = () => {
      setElapsedLabel(formatElapsed(Date.now() - jobStartTime));
    };

    update();

    if (gradeJob?.status === "done" || gradeJob?.status === "error") {
      return;
    }

    const intervalId = setInterval(update, 400);
    return () => clearInterval(intervalId);
  }, [jobStartTime, gradeJob?.status]);

  const progressIdentityLabel = useMemo(() => {
    const identity = gradeJob?.partial?.identity;
    if (identity) {
      const parts: string[] = [];
      if (identity.player) parts.push(identity.player);
      if (identity.year) parts.push(String(identity.year));
      if (identity.brand) parts.push(identity.brand);
      if (identity.setName) parts.push(identity.setName);
      if (identity.parallel) parts.push(identity.parallel);
      if (parts.length) {
        return parts.join(" · ");
      }
    }

    if (identifiedCard) {
      const parts: string[] = [];
      if (identifiedCard.player_name) parts.push(identifiedCard.player_name);
      if (identifiedCard.year) parts.push(identifiedCard.year);
      if (identifiedCard.set_name) parts.push(identifiedCard.set_name);
      if (identifiedCard.parallel_type) parts.push(identifiedCard.parallel_type);
      return parts.length ? parts.join(" · ") : null;
    }

    return null;
  }, [gradeJob?.partial?.identity, identifiedCard]);

  const showPreliminaryBadge = Boolean(
    gradeEstimate && gradeJob && gradeJob.status !== "done"
  );

  const confidencePillClass = identifiedCard?.confidence
    ? (confidencePillClasses[identifiedCard.confidence] ?? confidencePillClasses.medium)
    : null;

  return (
    <AuthenticatedLayout>
      <main className="mx-auto max-w-3xl px-4 py-8 lg:max-w-5xl">

        {/* ── Page header ───────────────────────────────────────────── */}
        <div className="mb-10">
          <h1 className="text-2xl font-semibold text-[var(--biz-text)]">
            {gradingCopy.page.title}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
            {gradingCopy.page.subtitle}
          </p>
        </div>

        {!identifiedCard ? (
          <div className="space-y-8">

            {/* ── Scanner Bay (Dual Upload: Front + Back Required) ── */}
            <section>
              <Surface className="p-6">
                <DualCardUploader
                  onIdentified={(data: CardIdentificationResult) => {
                    setIdentifiedCard(data);
                  }}
                  onStart={() => {
                    setIdentifiedCard(null);
                    setGradeEstimate(null);
                    setValueResult(null);
                    setValueError(null);
                    setEstimateError(null);
                    setEstimateAttempted(false);
                    setGradeJob(null);
                    setGradeJobId(null);
                    setActiveRunId(null);
                  }}
                  onReset={() => {
                    setIdentifiedCard(null);
                    setGradeEstimate(null);
                    setValueResult(null);
                    setValueError(null);
                    setGradeJob(null);
                    setGradeJobId(null);
                    setActiveRunId(null);
                  }}
                  disabled={false}
                />

                {/* Scanner Tips — anchored beneath the dropzone */}
                <div className="mt-4 px-1">
                  <ScannerTips />
                </div>
              </Surface>
            </section>

            {/* ── Recent Scans ─────────────────────────────────────── */}
            <GradeEstimatorHistoryPanel
              refreshToken={historyRefreshToken}
              onSelect={handleHistorySelect}
            />

            {/* ── Submission Builder (collapsed by default) ─────────── */}
            <Surface className="p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-medium text-[var(--biz-text)]">Submission Builder</h3>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    Plan PSA submissions after your grade analysis.
                  </p>
                </div>
                <button
                  onClick={() => setShowSubmissionBuilder((prev) => !prev)}
                  className="cc-btn-secondary rounded-lg px-3 py-1.5 text-xs"
                >
                  {showSubmissionBuilder ? "Hide" : "Show"}
                </button>
              </div>
              {showSubmissionBuilder ? (
                <div className="mt-4 border-t border-[color:var(--border)] pt-4">
                  <SubmissionBuilderPanel
                    identifiedCard={identifiedCard}
                    gradeEstimate={gradeEstimate}
                  />
                </div>
              ) : null}
            </Surface>
          </div>
        ) : (
          <>
            {/* ── Recent Scans (above results) ─────────────────────── */}
            <div className="mb-8">
              <GradeEstimatorHistoryPanel
                refreshToken={historyRefreshToken}
                onSelect={handleHistorySelect}
              />
            </div>

            <div className="space-y-8">
              {/* ── Identified Card Preview ───────────────────────── */}
              <Surface className="p-6">
                <div className="flex items-start gap-5">
                  {identifiedCard.imageUrl ? (
                    <div className="shrink-0 flex flex-col items-start gap-2">
                      <img
                        src={identifiedCard.imageUrl}
                        alt={identifiedCard.player_name}
                        className="h-40 w-28 rounded-lg border border-[color:var(--border)] object-cover"
                      />
                      {identifiedCard.imageUrls && identifiedCard.imageUrls.length > 1 ? (
                        <div className="flex flex-wrap gap-1.5 max-w-[112px]">
                          {identifiedCard.imageUrls.slice(1).map((url, index) => (
                            <img
                              key={`${url}-${index}`}
                              src={url}
                              alt={`${identifiedCard.player_name} ${index + 2}`}
                              className="h-11 w-8 rounded border border-[color:var(--border)] object-cover"
                            />
                          ))}
                        </div>
                      ) : null}
                      {identifiedCard.imageUrls && identifiedCard.imageUrls.length > 1 ? (
                        <p className="text-[10px] text-[var(--biz-muted)]">
                          {identifiedCard.imageUrls.length} photos
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="flex-1 min-w-0">
                    <h2 className="text-xl font-semibold text-[var(--biz-text)] leading-tight">
                      {identifiedCard.player_name ?? ""}
                    </h2>
                    <div className="mt-1">
                      <CardIdentitySubtitle
                        identity={
                          identifiedCard.cardIdentity ?? (identifiedCard
                            ? {
                                year: identifiedCard.year ? Number(identifiedCard.year) : null,
                                brand: null,
                                setName: identifiedCard.set_name ?? null,
                                subset: null,
                                parallel: identifiedCard.parallel_type ?? null,
                              }
                            : null)
                        }
                        className="text-sm text-[var(--muted)]"
                      />
                    </div>

                    {needsYearConfirmation(
                      identifiedCard.year,
                      identifiedCard.confidence,
                      identifiedCard.cardIdentity?.fieldConfidence?.year
                    ) ? (
                      <div className="mt-2">
                        <NeedsConfirmationPill label="Year" />
                      </div>
                    ) : null}

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <ConfidenceBadge
                        confidence={identifiedCard.confidence}
                        fieldConfidence={identifiedCard.cardIdentity?.fieldConfidence}
                        label={gradingCopy.status.confidenceLabels[identifiedCard.confidence]}
                      />
                      {confidencePillClass ? (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${confidencePillClass}`}>
                          {identifiedCard.confidence}
                        </span>
                      ) : null}
                    </div>

                    {/* Actions */}
                    <div className="mt-5 flex flex-wrap gap-2">
                      <button
                        onClick={handleEstimateGrade}
                        disabled={estimatingGrade || !!gradeEstimate || !!identifiedCard.grade}
                        className="cc-btn-primary inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {estimatingGrade ? (
                          <>
                            <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                            {gradingCopy.actions.analyzing}
                          </>
                        ) : (
                          <>
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {gradingCopy.actions.analyze}
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => setShowConfirmModal(true)}
                        className="cc-btn-secondary inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium"
                      >
                        {gradingCopy.actions.addToCollection}
                      </button>
                      <button
                        onClick={handleReset}
                        className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-[var(--muted)] transition-colors hover:text-[var(--biz-text)]"
                      >
                        {gradingCopy.actions.uploadNewCard}
                      </button>
                    </div>
                  </div>
                </div>
              </Surface>

              {/* ── Grade Estimate ────────────────────────────────── */}
              {gradeEstimate || gradeJob ? (
                <div className="space-y-6">

                  {/* Animation sequence — shown while estimate is processing */}
                  <AnimatePresence mode="wait">
                    {showAnimation ? (
                      <motion.div key="animation">
                        <GradeAnalysisAnimation
                          imageUrl={
                            identifiedCard?.imageUrl ||
                            identifiedCard?.imageUrls?.[0] ||
                            null
                          }
                          estimate={gradeEstimate}
                          valueResult={valueResult}
                          hasError={gradeJob?.status === "error"}
                          onComplete={() => setShowAnimation(false)}
                        />
                      </motion.div>
                    ) : (
                      <motion.div
                        key="results"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, ease: "easeOut" }}
                        className="space-y-6"
                      >
                        {gradeJob ? (
                          <GradeEstimateProgressPanel
                            status={gradeJob.status}
                            steps={gradeJob.steps}
                            identityLabel={progressIdentityLabel}
                            errorMessage={gradeJob.status === "error" ? estimateError : null}
                            elapsedLabel={elapsedLabel}
                          />
                        ) : null}

                        {gradeEstimate ? (
                          <GradeProbabilityPanel
                            estimate={gradeEstimate}
                            cardIdentity={identifiedCard ? {
                              player_name: identifiedCard.player_name,
                              year: identifiedCard.year,
                              set_name: identifiedCard.set_name,
                              parallel_type: identifiedCard.parallel_type,
                            } : null}
                            primaryImageUrl={
                              identifiedCard?.imageUrl || identifiedCard?.imageUrls?.[0] || null
                            }
                            imageUrls={identifiedCard?.imageUrls ?? null}
                            scanPhotos={identifiedCard?.scanPhotos ?? null}
                            showPreliminaryBadge={showPreliminaryBadge}
                          />
                        ) : null}

                        <GradeScanLabelPanel
                          enabled={gradingLabelsEnabled}
                          scanId={activeRunId}
                        />

                        {gradeEstimate && (valueLoading || valueResult || valueError) ? (
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="text-[10px] font-medium text-[var(--biz-muted)] uppercase tracking-normal">
                                {gradingCopy.valuePanel.marketAnalysisLabel}
                              </span>
                              <button
                                onClick={() => setShowMarketAnalysis((prev) => !prev)}
                                className="text-xs font-medium text-[var(--biz-primary)] hover:underline"
                              >
                                {showMarketAnalysis
                                  ? gradingCopy.valuePanel.hideMarketImpact
                                  : gradingCopy.valuePanel.showMarketImpact}
                              </button>
                            </div>
                            {showMarketAnalysis ? (
                              valueError ? (
                                <div className="space-y-2">
                                  <InlineNotice type="warning">
                                    <p>{valueError}</p>
                                    <button
                                      onClick={fetchValue}
                                      className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-100"
                                    >
                                      Retry
                                    </button>
                                  </InlineNotice>
                                </div>
                              ) : (
                                <GradeEstimatorValuePanel
                                  result={
                                    valueResult ?? {
                                      raw: { price: null, n: 0, method: "none" },
                                      psa: {
                                        "10": { price: null, n: 0, method: "none" },
                                        "9": { price: null, n: 0, method: "none" },
                                        "8": { price: null, n: 0, method: "none" },
                                        ev: 0,
                                        netGain: 0,
                                        roi: 0,
                                      },
                                      bgs: {
                                        "9.5": { price: null, n: 0, method: "none" },
                                        "9": { price: null, n: 0, method: "none" },
                                        "8.5": { price: null, n: 0, method: "none" },
                                        ev: 0,
                                        netGain: 0,
                                        roi: 0,
                                      },
                                      bestOption: "none",
                                      rating: "no",
                                      confidence: "low",
                                      explanation: gradingCopy.status.postGradingValueLoading,
                                    }
                                  }
                                  loading={valueLoading}
                                />
                              )
                            ) : null}
                          </div>
                        ) : null}

                        {gradeJob?.status === "error" && !gradeEstimate ? (
                          <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
                            <div className="flex items-start gap-3">
                              <svg className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                              </svg>
                              <div>
                                <p className="text-sm font-medium text-amber-700">
                                  {gradingCopy.status.estimateUnavailableTitle}
                                </p>
                                <p className="text-xs text-amber-600 mt-0.5">
                                  {estimateError || gradingCopy.status.estimateUnavailableBody}
                                </p>
                              </div>
                            </div>
                          </div>
                        ) : null}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ) : identifiedCard.grade ? (
                <Surface className="p-5">
                  <div className="flex items-start gap-3">
                    <svg className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div>
                      <p className="text-sm font-medium text-[var(--biz-text)]">
                        {gradingCopy.status.alreadyGradedTitle}
                      </p>
                      <p className="text-xs text-[var(--biz-muted)] mt-0.5">
                        {gradingCopy.status.alreadyGradedBody(identifiedCard.grade)}
                      </p>
                    </div>
                  </div>
                </Surface>
              ) : estimateAttempted && !estimatingGrade && !gradeJob ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
                  <div className="flex items-start gap-3">
                    <svg className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <div>
                      <p className="text-sm font-medium text-amber-700">
                        {gradingCopy.status.estimateUnavailableTitle}
                      </p>
                      <p className="text-xs text-amber-600 mt-0.5">
                        {estimateError || gradingCopy.status.estimateUnavailableBody}
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}

              {/* ── Submission Builder ────────────────────────────── */}
              <Surface className="p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-medium text-[var(--biz-text)]">Submission Builder</h3>
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      Plan a PSA submission using this analysis.
                    </p>
                  </div>
                  <button
                    onClick={() => setShowSubmissionBuilder((prev) => !prev)}
                    className="cc-btn-secondary rounded-lg px-3 py-1.5 text-xs"
                  >
                    {showSubmissionBuilder ? "Hide" : "Show"}
                  </button>
                </div>
                {showSubmissionBuilder ? (
                  <div className="mt-4 border-t border-[color:var(--border)] pt-4">
                    <SubmissionBuilderPanel
                      identifiedCard={identifiedCard}
                      gradeEstimate={gradeEstimate}
                    />
                  </div>
                ) : null}
              </Surface>
            </div>
          </>
        )}

        {/* ── Confirm Add Card Modal ─────────────────────────────────── */}
        <ConfirmAddCardModal
          isOpen={showConfirmModal}
          onClose={() => setShowConfirmModal(false)}
          onSuccess={(playerName, item, destination) => {
            const resolvedDestination =
              destination ?? (item?.item_kind === "inventory" ? "inventory" : "collection");
            setToast({
              type: "success",
              message:
                resolvedDestination === "inventory"
                  ? `Added ${playerName} to inventory!`
                  : gradingCopy.toast.addedToCollection(playerName),
            });
            setShowConfirmModal(false);
            handleReset();
          }}
          onLimitReached={() => {
            setShowConfirmModal(false);
            setShowPaywall(true);
          }}
          cardData={identifiedCard}
        />

        {/* ── Paywall Modal ──────────────────────────────────────────── */}
        <PaywallModal
          isOpen={showPaywall}
          onClose={() => setShowPaywall(false)}
          type="collection"
        />

        {/* ── Toast ─────────────────────────────────────────────────── */}
        {toast ? (
          <div className="fixed bottom-5 right-5 z-50 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-700">
            <svg className="w-4 h-4 text-emerald-700 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span className="text-sm">{toast.message}</span>
            <button
              onClick={() => setToast(null)}
              className="ml-1 text-[var(--biz-muted)] transition-colors hover:text-[var(--biz-text)]"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ) : null}
      </main>
    </AuthenticatedLayout>
  );
}
