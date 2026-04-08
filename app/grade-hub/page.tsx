"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Cormorant_Garamond } from "next/font/google";
import { usePathname, useRouter } from "next/navigation";
import AuthenticatedLayout from "@/components/AuthenticatedLayout";
import GradeEstimatorValuePanel from "@/components/GradeEstimatorValuePanel";
import BlackLabelScanCard from "@/components/grading/BlackLabelScanCard";
import GradeEstimatorHistoryPanel from "@/components/grading/GradeEstimatorHistoryPanel";
import GradeProbabilityPanel from "@/components/grading/GradeProbabilityPanel";
import type {
  CardIdentificationResult,
  GradeEstimate,
  GradeEstimatorHistoryRun,
  WorthGradingResult,
} from "@/types";
import { useAuth } from "@/contexts/AuthContext";
import { upsertCachedHistoryRun } from "@/lib/grading/gradeEstimatorHistoryCache";
import {
  buildHistoryCacheCardSnapshot,
  buildHistoryCardSnapshot,
  sanitizeHistoryCardSnapshot,
} from "@/lib/grading/historySnapshots";
import type { GradeScanSessionStage } from "@/components/grading/useGradeScanSession";

const SubmissionsTabContent = dynamic(
  () => import("@/components/grading/SubmissionsTabContent"),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-[28px] border border-white/10 bg-white/[0.03] px-6 py-12 text-center text-sm text-white/45">
        Loading submissions…
      </div>
    ),
  }
);

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

type GradeWorkspaceCapabilities = {
  tier: "free" | "pro" | "business";
  unlimited: boolean;
  remaining: number | null;
  nextGrantAt: string | null;
  lastGrantAt?: string | null;
  maxCardsPerSession: number;
  maxPhotosPerCard: number;
  monthlyBudgetCents: number;
  monthlySpentCents: number;
  monthlyReservedCents: number;
  monthlyRemainingCents: number;
};

function makeSessionId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `grade-session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatTimeUntil(iso: string | null): string {
  if (!iso) return "";
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "soon";
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  if (days > 0) return `${days}d ${hours}h`;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function restoreHistoryCard(run: GradeEstimatorHistoryRun): CardIdentificationResult {
  const fallbackImageUrls =
    run.card.imageUrls && run.card.imageUrls.length > 0
      ? run.card.imageUrls
      : run.card.scanPhotos?.map((photo) => photo.url) ?? [];
  const imageUrl = run.card.imageUrl || fallbackImageUrls[0] || "";

  return {
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
  };
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-[24px] border border-white/8 bg-white/[0.03] px-5 py-4">
      <p className="text-[11px] uppercase tracking-[0.28em] text-[#b89a55]">{label}</p>
      <p className="mt-3 text-2xl font-semibold text-[#f8f2e7]">{value}</p>
      <p className="mt-2 text-sm text-white/45">{hint}</p>
    </div>
  );
}

export default function GradeHubPage() {
  const { authUser, loading: authLoading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const historyViewerRef = useRef<HTMLDivElement | null>(null);
  const [capabilities, setCapabilities] = useState<GradeWorkspaceCapabilities | null>(null);
  const [loadingCapabilities, setLoadingCapabilities] = useState(true);
  const [capabilitiesError, setCapabilitiesError] = useState<string | null>(null);
  const [sessionIds, setSessionIds] = useState<string[]>(() => [makeSessionId()]);
  const [sessionStages, setSessionStages] = useState<Record<string, GradeScanSessionStage>>({});
  const [historyRefreshToken, setHistoryRefreshToken] = useState(0);
  const [selectedHistoryRun, setSelectedHistoryRun] = useState<GradeEstimatorHistoryRun | null>(null);

  const isBusinessRoute = pathname?.startsWith("/business") ?? false;
  const exitHref = isBusinessRoute ? "/business" : "/dashboard";
  const settingsHref = isBusinessRoute ? "/business/settings" : "/settings";

  const loadCapabilities = useCallback(async () => {
    setLoadingCapabilities(true);
    setCapabilitiesError(null);
    try {
      const response = await fetch("/api/grading/credits", { cache: "no-store" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error ?? "Failed to load grade workspace.");
      }

      setCapabilities(payload as GradeWorkspaceCapabilities);
      setSessionIds((current) => {
        const maxCards = Math.max(1, payload?.maxCardsPerSession ?? 1);
        return current.slice(0, maxCards);
      });
    } catch (error) {
      setCapabilitiesError(
        error instanceof Error ? error.message : "Failed to load grade workspace."
      );
    } finally {
      setLoadingCapabilities(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && !authUser) {
      router.replace("/login");
    }
  }, [authLoading, authUser, router]);

  useEffect(() => {
    if (authLoading || !authUser) return;
    void loadCapabilities();
  }, [authLoading, authUser, loadCapabilities]);

  const maxCardsPerSession = capabilities?.maxCardsPerSession ?? 1;
  const maxPhotosPerCard = capabilities?.maxPhotosPerCard ?? 10;
  const isBusinessQueue = maxCardsPerSession > 1;

  const activeRunningSessionId = useMemo(
    () =>
      sessionIds.find((id) =>
        ["uploading", "identifying", "analyzing"].includes(sessionStages[id] ?? "draft")
      ) ?? null,
    [sessionIds, sessionStages]
  );

  const nextQueuedSessionId = useMemo(() => {
    if (activeRunningSessionId) return null;
    return (
      sessionIds.find((id) =>
        ["ready", "scheduled"].includes(sessionStages[id] ?? "draft")
      ) ?? null
    );
  }, [activeRunningSessionId, sessionIds, sessionStages]);

  const handleSessionStageChange = useCallback(
    (sessionId: string, stage: GradeScanSessionStage) => {
      setSessionStages((current) => ({ ...current, [sessionId]: stage }));
    },
    []
  );

  const handleFreshSession = useCallback(() => {
    const nextIds = Array.from({ length: 1 }, () => makeSessionId());
    setSessionIds(nextIds);
    setSessionStages({});
    setSelectedHistoryRun(null);
  }, []);

  const handleAddQueueCard = useCallback(() => {
    setSessionIds((current) => {
      if (current.length >= maxCardsPerSession) return current;
      return [...current, makeSessionId()];
    });
  }, [maxCardsPerSession]);

  const saveHistoryRun = useCallback(
    async (options: {
      jobId: string;
      card: CardIdentificationResult;
      estimate: GradeEstimate;
      postGradingValue?: WorthGradingResult | null;
    }) => {
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
        const run =
          response.ok && payload?.run ? (payload.run as GradeEstimatorHistoryRun) : null;

        const fallbackRun: GradeEstimatorHistoryRun = {
          id: run?.id ?? `local-grade-run-${options.jobId}`,
          user_id: run?.user_id ?? authUser?.id ?? "local",
          job_id: options.jobId,
          card: cachedCard,
          estimate: options.estimate,
          post_grading_value: options.postGradingValue ?? null,
          created_at: run?.created_at ?? new Date().toISOString(),
        };

        upsertCachedHistoryRun(fallbackRun);
        setHistoryRefreshToken((value) => value + 1);
      } catch {
        const fallbackRun: GradeEstimatorHistoryRun = {
          id: `local-grade-run-${options.jobId}`,
          user_id: authUser?.id ?? "local",
          job_id: options.jobId,
          card: cachedCard,
          estimate: options.estimate,
          post_grading_value: options.postGradingValue ?? null,
          created_at: new Date().toISOString(),
        };
        upsertCachedHistoryRun(fallbackRun);
        setHistoryRefreshToken((value) => value + 1);
      }
    },
    [authUser?.id]
  );

  const handleHistorySelect = useCallback((run: GradeEstimatorHistoryRun) => {
    setSelectedHistoryRun(run);
    requestAnimationFrame(() => {
      historyViewerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  if (authLoading || (!authUser && loadingCapabilities)) {
    return (
      <AuthenticatedLayout>
        <div className="flex min-h-screen items-center justify-center bg-[#060606]">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#43351d] border-t-[#d0af66]" />
        </div>
      </AuthenticatedLayout>
    );
  }

  return (
    <AuthenticatedLayout>
      <div className="relative min-h-screen overflow-hidden bg-[#060606] text-[#f8f2e7]">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-[-8rem] top-[-6rem] h-[28rem] w-[28rem] rounded-full bg-[#8e7740]/20 blur-[120px]" />
          <div className="absolute right-[-5rem] top-[12rem] h-[24rem] w-[24rem] rounded-full bg-[#6d5630]/16 blur-[140px]" />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.02),transparent_18%,transparent_80%,rgba(255,255,255,0.02))]" />
        </div>

        <div className="relative mx-auto max-w-[1480px] px-5 pb-20 pt-6 sm:px-8 lg:px-12">
          <header className="rounded-[30px] border border-white/8 bg-black/35 px-6 py-5 backdrop-blur sm:px-8">
            <div className="flex flex-wrap items-start justify-between gap-6">
              <div className="max-w-3xl">
                <p className="text-[11px] uppercase tracking-[0.38em] text-[#b89a55]">
                  Grade Probability Engine
                </p>
                <h1 className={`${cormorant.className} mt-4 text-5xl leading-none text-[#f8f2e7] sm:text-6xl`}>
                  Black Label Workspace
                </h1>
                <p className="mt-4 max-w-2xl text-base text-white/60 sm:text-lg">
                  Upload, stage, and analyze cards in one uninterrupted workspace. The grading engine and processing remain intact; the path to results is faster and cleaner.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => router.push(exitHref)}
                  className="rounded-full border border-white/10 px-4 py-2 text-[11px] uppercase tracking-[0.24em] text-white/65 transition hover:border-[#8e7740]/35 hover:text-[#f6efe1]"
                >
                  Exit workspace
                </button>
                <button
                  type="button"
                  onClick={() => router.push(settingsHref)}
                  className="rounded-full border border-white/10 px-4 py-2 text-[11px] uppercase tracking-[0.24em] text-white/65 transition hover:border-[#8e7740]/35 hover:text-[#f6efe1]"
                >
                  Settings
                </button>
                <button
                  type="button"
                  onClick={handleFreshSession}
                  className="rounded-full bg-[#b89a55] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-black transition hover:bg-[#d5b870]"
                >
                  Fresh session
                </button>
              </div>
            </div>
          </header>

          <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Workspace"
              value={
                capabilities?.tier === "business"
                  ? "Business"
                  : capabilities?.tier === "pro"
                    ? "Collector Pro"
                    : "Collector"
              }
              hint={
                capabilities?.tier === "business"
                  ? "Business sessions can queue up to 10 cards."
                  : "Collector sessions stay focused on one card at a time."
              }
            />
            <StatCard
              label="Session width"
              value={`${maxCardsPerSession} card${maxCardsPerSession === 1 ? "" : "s"}`}
              hint={`Up to ${maxPhotosPerCard} photos per card.`}
            />
            <StatCard
              label="Budget"
              value={
                capabilities
                  ? `${formatMoney(capabilities.monthlyRemainingCents)} left`
                  : "Loading"
              }
              hint={
                capabilities
                  ? `${formatMoney(capabilities.monthlySpentCents)} spent this month`
                  : "Monthly grading budget loads from server policy."
              }
            />
            <StatCard
              label="Access"
              value={
                capabilities?.unlimited
                  ? "Unlimited"
                  : capabilities
                    ? `${capabilities.remaining ?? 0} scans`
                    : "Loading"
              }
              hint={
                capabilities?.unlimited
                  ? capabilities.monthlyReservedCents > 0
                    ? `${formatMoney(capabilities.monthlyReservedCents)} temporarily reserved by an active run`
                    : "Paid workspace scans use the monthly budget guardrail."
                  : capabilities?.nextGrantAt
                    ? `Next free scan in ${formatTimeUntil(capabilities.nextGrantAt)}`
                    : "Free scan balance is enforced server-side."
              }
            />
          </section>

          {capabilitiesError ? (
            <div className="mt-6 rounded-[24px] border border-rose-500/25 bg-rose-500/10 px-5 py-4 text-sm text-rose-100">
              {capabilitiesError}
            </div>
          ) : null}

          {loadingCapabilities ? (
            <div className="mt-8 rounded-[30px] border border-white/8 bg-white/[0.03] px-6 py-12 text-center text-sm text-white/45">
              Loading grade workspace…
            </div>
          ) : (
            <>
              <section className="mt-8">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.32em] text-[#b89a55]">
                      Live workbench
                    </p>
                    <h2 className={`${cormorant.className} mt-2 text-4xl text-[#f8f2e7]`}>
                      Upload with intent. Let the engine do the rest.
                    </h2>
                  </div>

                  {isBusinessQueue && sessionIds.length < maxCardsPerSession ? (
                    <button
                      type="button"
                      onClick={handleAddQueueCard}
                      className="rounded-full border border-[#8e7740]/35 px-4 py-2 text-[11px] uppercase tracking-[0.24em] text-[#f2dfad] transition hover:bg-[#8e7740]/10"
                    >
                      Add queued card
                    </button>
                  ) : null}
                </div>

                <div className="space-y-6">
                  {sessionIds.map((sessionId, index) => (
                    <BlackLabelScanCard
                      key={sessionId}
                      title={
                        isBusinessQueue
                          ? `Queued Card ${String(index + 1).padStart(2, "0")}`
                          : "Primary Scan"
                      }
                      eyebrow={isBusinessQueue ? "Business queue" : "Collector flow"}
                      maxPhotos={maxPhotosPerCard}
                      compact={isBusinessQueue}
                      canStartNow={
                        !isBusinessQueue ||
                        (!activeRunningSessionId && nextQueuedSessionId === sessionId)
                      }
                      autoStartEnabled={
                        !activeRunningSessionId &&
                        ["ready", "scheduled"].includes(
                          sessionStages[sessionId] ?? "draft"
                        ) &&
                        nextQueuedSessionId === sessionId
                      }
                      onStageChange={(stage) => handleSessionStageChange(sessionId, stage)}
                      onComplete={(result) => {
                        void saveHistoryRun(result);
                      }}
                    />
                  ))}
                </div>
              </section>

              <section className="mt-12 grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
                <div className="space-y-6">
                  <div className="rounded-[28px] border border-white/8 bg-white/[0.03] p-6">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.32em] text-[#b89a55]">
                          Scan history
                        </p>
                        <h3 className={`${cormorant.className} mt-2 text-3xl text-[#f8f2e7]`}>
                          Recent runs, ready to reopen
                        </h3>
                      </div>
                    </div>
                    <GradeEstimatorHistoryPanel
                      onSelect={handleHistorySelect}
                      refreshToken={historyRefreshToken}
                      initialExpanded
                    />
                  </div>

                  <div ref={historyViewerRef} className="rounded-[28px] border border-white/8 bg-white/[0.03] p-6">
                    <p className="text-[11px] uppercase tracking-[0.32em] text-[#b89a55]">
                      Selected result
                    </p>
                    <h3 className={`${cormorant.className} mt-2 text-3xl text-[#f8f2e7]`}>
                      {selectedHistoryRun ? selectedHistoryRun.card.player_name : "No history run selected"}
                    </h3>
                    <div className="mt-5">
                      {selectedHistoryRun ? (
                        <div className="space-y-4">
                          <GradeProbabilityPanel
                            estimate={selectedHistoryRun.estimate}
                            cardIdentity={restoreHistoryCard(selectedHistoryRun)}
                            primaryImageUrl={selectedHistoryRun.card.imageUrl}
                            imageUrls={selectedHistoryRun.card.imageUrls}
                            scanPhotos={selectedHistoryRun.card.scanPhotos}
                          />
                          {selectedHistoryRun.post_grading_value ? (
                            <GradeEstimatorValuePanel
                              result={selectedHistoryRun.post_grading_value}
                            />
                          ) : null}
                        </div>
                      ) : (
                        <div className="rounded-[22px] border border-white/8 bg-black/20 px-5 py-10 text-sm text-white/45">
                          Pick a run from history to inspect its saved grade distribution and value outlook.
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="rounded-[28px] border border-white/8 bg-white/[0.03] p-6">
                  <p className="text-[11px] uppercase tracking-[0.32em] text-[#b89a55]">
                    Submission builder
                  </p>
                  <h3 className={`${cormorant.className} mt-2 text-3xl text-[#f8f2e7]`}>
                    Keep scan outcomes close to the submission workflow
                  </h3>
                  <p className="mt-3 max-w-2xl text-sm text-white/50">
                    History and submissions now live inside the same workspace. Analyze, compare, then move the cards that deserve a real grading order.
                  </p>
                  <div className="mt-6">
                    <SubmissionsTabContent />
                  </div>
                </div>
              </section>
            </>
          )}
        </div>
      </div>
    </AuthenticatedLayout>
  );
}
