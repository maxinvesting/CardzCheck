"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import GradeEstimatorValuePanel from "@/components/GradeEstimatorValuePanel";
import GradeProbabilityPanel from "@/components/grading/GradeProbabilityPanel";
import { useAuth } from "@/contexts/AuthContext";
import {
  loadCachedHistoryRuns,
  mergeHistoryRuns,
} from "@/lib/grading/gradeEstimatorHistoryCache";
import {
  loadGradeHubResultsSession,
  type GradeHubResultsSession,
} from "@/lib/grading/gradeHubResultsSession";
import { confidencePillClasses } from "@/theme/tokens";
import type { GradeEstimatorHistoryRun } from "@/types";

function formatGradeNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, "");
}

function formatRange(run: GradeEstimatorHistoryRun): string {
  const low = run.estimate.estimated_grade_low;
  const high = run.estimate.estimated_grade_high;
  if (!Number.isFinite(low) || !Number.isFinite(high)) return "Grade unavailable";
  return low === high
    ? `PSA ${formatGradeNumber(low)}`
    : `PSA ${formatGradeNumber(low)}-${formatGradeNumber(high)}`;
}

function formatSessionDate(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function buildCardMeta(run: GradeEstimatorHistoryRun): string {
  return [
    run.card.year,
    run.card.set_name,
    run.card.parallel_type,
    run.card.card_number ? `#${run.card.card_number}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function orderRuns(
  runs: GradeEstimatorHistoryRun[],
  jobIds: string[]
): GradeEstimatorHistoryRun[] {
  const order = new Map(jobIds.map((jobId, index) => [jobId, index]));
  return [...runs].sort((a, b) => {
    const left = order.get(a.job_id) ?? Number.MAX_SAFE_INTEGER;
    const right = order.get(b.job_id) ?? Number.MAX_SAFE_INTEGER;
    return left - right;
  });
}

function ResultsPageInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { authUser, loading: authLoading } = useAuth();

  const gradeHubBasePath = pathname?.startsWith("/business") ? "/business/grade-hub" : "/grade-hub";
  const sessionId = searchParams.get("session") ?? "";
  const jobsParam = searchParams.get("jobs") ?? "";

  const queryJobIds = useMemo(
    () => jobsParam.split(",").map((value) => value.trim()).filter(Boolean),
    [jobsParam]
  );

  const [session, setSession] = useState<GradeHubResultsSession | null>(null);
  const [runs, setRuns] = useState<GradeEstimatorHistoryRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !authUser) router.replace("/login");
  }, [authLoading, authUser, router]);

  useEffect(() => {
    if (!sessionId) {
      setSession(null);
      return;
    }
    setSession(loadGradeHubResultsSession(sessionId));
  }, [sessionId]);

  const targetJobIds = useMemo(() => {
    const merged = [...queryJobIds, ...(session?.jobIds ?? [])];
    return Array.from(new Set(merged.filter(Boolean)));
  }, [queryJobIds, session?.jobIds]);

  useEffect(() => {
    if (authLoading) return;

    if (!authUser) {
      setLoading(false);
      return;
    }

    if (targetJobIds.length === 0) {
      setRuns([]);
      setError("No completed scan results were attached to this page.");
      setLoading(false);
      return;
    }

    let cancelled = false;
    const cachedAll = loadCachedHistoryRuns();
    const cachedRuns = orderRuns(
      cachedAll.filter((run) => targetJobIds.includes(run.job_id)),
      targetJobIds
    );

    setRuns(cachedRuns);
    setLoading(true);
    setError(null);

    const load = async () => {
      try {
        const response = await fetch("/api/grade-estimator/history", {
          cache: "no-store",
        });

        if (cancelled) return;

        if (response.status === 401 || response.status === 403) {
          setRuns(cachedRuns);
          setError(
            cachedRuns.length === 0
              ? "These results are only available in recent scan history."
              : null
          );
          return;
        }

        if (!response.ok) {
          setRuns(cachedRuns);
          setError(
            cachedRuns.length === 0
              ? "Results are temporarily unavailable. Try opening them again from Grade Hub history."
              : null
          );
          return;
        }

        const payload = await response.json().catch(() => null);
        const remoteRuns = Array.isArray(payload?.runs) ? payload.runs : [];
        const merged = mergeHistoryRuns(remoteRuns, cachedAll);
        const matchingRuns = orderRuns(
          merged.filter((run) => targetJobIds.includes(run.job_id)),
          targetJobIds
        );

        setRuns(matchingRuns);
        setError(
          matchingRuns.length === 0
            ? "Finished scan results could not be found. Open Grade Hub history to reload them."
            : null
        );
      } catch {
        if (!cancelled) {
          setRuns(cachedRuns);
          setError(
            cachedRuns.length === 0
              ? "Results are temporarily unavailable. Try opening them again from Grade Hub history."
              : null
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [authLoading, authUser, targetJobIds]);

  const scanSlots = Math.max(1, session?.activeSlots ?? runs.length ?? 1);
  const scanPath = `${gradeHubBasePath}/scan?slots=${scanSlots}&mode=scan`;

  return (
    <>
      <main className="mx-auto max-w-6xl px-4 py-8 lg:px-6">
        <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <Link
              href={gradeHubBasePath}
              className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--biz-muted)] transition-colors hover:text-[var(--biz-text)]"
            >
              Grade Hub
            </Link>
            <h1 className="mt-3 text-3xl font-semibold tracking-normal text-[var(--biz-text)]">
              Scan Results
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--biz-muted)]">
              Full grade probability output, card breakdown, and grading value guidance for the finished scan.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link href={gradeHubBasePath} className="cc-btn-secondary rounded-lg px-4 py-2 text-sm">
              Back to Hub
            </Link>
            <Link href={scanPath} className="cc-btn-primary rounded-lg px-4 py-2 text-sm">
              New Scan
            </Link>
          </div>
        </div>

        {session ? (
          <section className="cc-surface mb-8 p-5">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--biz-muted)]">
                  Session Summary
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-[color:var(--biz-hover)] px-3 py-1 text-xs font-medium text-[var(--biz-text)]">
                    {session.activeSlots} card{session.activeSlots === 1 ? "" : "s"}
                  </span>
                  <span className="rounded-full bg-[color:var(--biz-hover)] px-3 py-1 text-xs font-medium text-[var(--biz-text)]">
                    Target grader: {session.gradingCompany}
                  </span>
                  <span className="text-xs text-[var(--biz-muted)]">
                    {formatSessionDate(session.createdAt)}
                  </span>
                </div>
                {session.cardTitle ? (
                  <p className="mt-4 text-base font-medium text-[var(--biz-text)]">
                    {session.cardTitle}
                  </p>
                ) : null}
                {session.notes ? (
                  <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--biz-muted)]">
                    {session.notes}
                  </p>
                ) : null}
              </div>

              {session.quickFlags.length > 0 ? (
                <div className="min-w-[220px]">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--biz-muted)]">
                    Flags
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {session.quickFlags.map((flag) => (
                      <span
                        key={flag}
                        className="rounded-full border border-[var(--biz-warning-border)] bg-[var(--biz-warning-soft)] px-3 py-1 text-xs font-medium text-[var(--biz-warning)]"
                      >
                        {flag}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </section>
        ) : null}

        {loading ? (
          <div className="space-y-4">
            {[0, 1].map((index) => (
              <div key={index} className="cc-surface animate-pulse p-5">
                <div className="h-5 w-40 rounded bg-[color:var(--biz-skeleton)]" />
                <div className="mt-3 h-4 w-72 rounded bg-[color:var(--biz-skeleton)]" />
                <div className="mt-6 h-64 rounded bg-[color:var(--biz-skeleton)]" />
              </div>
            ))}
          </div>
        ) : runs.length === 0 ? (
          <section className="cc-surface p-6">
            <h2 className="text-lg font-semibold text-[var(--biz-text)]">Results unavailable</h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--biz-muted)]">
              {error ?? "No finished scan results were found for this session."}
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link href={gradeHubBasePath} className="cc-btn-secondary rounded-lg px-4 py-2 text-sm">
                Open Grade Hub
              </Link>
              <Link href={scanPath} className="cc-btn-primary rounded-lg px-4 py-2 text-sm">
                Start New Scan
              </Link>
            </div>
          </section>
        ) : (
          <div className="space-y-8">
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {runs.map((run, index) => {
                const imageUrl =
                  run.card.imageUrl ||
                  run.card.imageUrls?.[0] ||
                  run.card.scanPhotos?.[0]?.url ||
                  "";
                const confidence = run.estimate.grade_probabilities?.confidence ?? null;
                const confidenceClass = confidence
                  ? (confidencePillClasses[confidence] ?? confidencePillClasses.medium)
                  : null;

                return (
                  <a
                    key={run.id}
                    href={`#result-${index + 1}`}
                    className="cc-surface flex gap-4 p-4 transition-colors hover:bg-[color:var(--biz-hover)]"
                  >
                    {imageUrl ? (
                      <Image
                        src={imageUrl}
                        alt={run.card.player_name || `Result ${index + 1}`}
                        width={64}
                        height={96}
                        unoptimized
                        className="h-24 w-16 shrink-0 rounded-lg border border-[color:var(--biz-border)] object-cover"
                      />
                    ) : (
                      <div className="h-24 w-16 shrink-0 rounded-lg border border-[color:var(--biz-border)] bg-[color:var(--biz-surface-soft)]" />
                    )}

                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--biz-muted)]">
                        Result {index + 1}
                      </p>
                      <p className="mt-1 truncate text-base font-semibold text-[var(--biz-text)]">
                        {run.card.player_name || session?.cardTitle || "Card"}
                      </p>
                      {buildCardMeta(run) ? (
                        <p className="mt-1 truncate text-sm text-[var(--biz-muted)]">
                          {buildCardMeta(run)}
                        </p>
                      ) : null}
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-[color:var(--biz-hover)] px-2.5 py-1 text-xs font-medium text-[var(--biz-text)]">
                          {formatRange(run)}
                        </span>
                        {confidence && confidenceClass ? (
                          <span className={`text-[10px] font-semibold uppercase tracking-wide ${confidenceClass}`}>
                            {confidence}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </a>
                );
              })}
            </section>

            {error ? (
              <div className="rounded-lg border border-[var(--biz-warning-border)] bg-[var(--biz-warning-soft)] px-4 py-3 text-sm text-[var(--biz-warning)]">
                {error}
              </div>
            ) : null}

            {runs.map((run, index) => {
              const galleryUrls =
                run.card.imageUrls && run.card.imageUrls.length > 0
                  ? run.card.imageUrls
                  : run.card.scanPhotos?.map((photo) => photo.url) ?? [];
              const imageUrl =
                run.card.imageUrl || galleryUrls[0] || run.card.scanPhotos?.[0]?.url || "";
              const confidence = run.estimate.grade_probabilities?.confidence ?? null;
              const confidenceClass = confidence
                ? (confidencePillClasses[confidence] ?? confidencePillClasses.medium)
                : null;

              return (
                <section
                  key={run.id}
                  id={`result-${index + 1}`}
                  className="scroll-mt-24 space-y-4"
                >
                  <div className="cc-surface p-5">
                    <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
                      {imageUrl ? (
                        <div className="shrink-0">
                          <Image
                            src={imageUrl}
                            alt={run.card.player_name || `Result ${index + 1}`}
                            width={128}
                            height={176}
                            unoptimized
                            className="h-44 w-32 rounded-xl border border-[color:var(--biz-border)] object-cover"
                          />
                          {galleryUrls.length > 1 ? (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {galleryUrls.slice(1, 5).map((url, imageIndex) => (
                                <Image
                                  key={`${url}-${imageIndex}`}
                                  src={url}
                                  alt={`${run.card.player_name || "Card"} ${imageIndex + 2}`}
                                  width={40}
                                  height={56}
                                  unoptimized
                                  className="h-14 w-10 rounded-md border border-[color:var(--biz-border)] object-cover"
                                />
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ) : null}

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--biz-muted)]">
                              Result {index + 1}
                            </p>
                            <h2 className="mt-1 text-2xl font-semibold leading-tight text-[var(--biz-text)]">
                              {run.card.player_name || session?.cardTitle || "Card"}
                            </h2>
                            {buildCardMeta(run) ? (
                              <p className="mt-2 text-sm text-[var(--biz-muted)]">
                                {buildCardMeta(run)}
                              </p>
                            ) : null}
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-[color:var(--biz-hover)] px-3 py-1 text-xs font-medium text-[var(--biz-text)]">
                              {formatRange(run)}
                            </span>
                            {confidence && confidenceClass ? (
                              <span className={`text-[10px] font-semibold uppercase tracking-wide ${confidenceClass}`}>
                                {confidence}
                              </span>
                            ) : null}
                            <span className="text-xs text-[var(--biz-muted)]">
                              Saved {formatSessionDate(run.created_at)}
                            </span>
                          </div>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2">
                          {run.card.year ? (
                            <span className="rounded-full border border-[color:var(--biz-border)] px-3 py-1 text-xs text-[var(--biz-text)]">
                              Year {run.card.year}
                            </span>
                          ) : null}
                          {run.card.set_name ? (
                            <span className="rounded-full border border-[color:var(--biz-border)] px-3 py-1 text-xs text-[var(--biz-text)]">
                              {run.card.set_name}
                            </span>
                          ) : null}
                          {run.card.parallel_type ? (
                            <span className="rounded-full border border-[color:var(--biz-border)] px-3 py-1 text-xs text-[var(--biz-text)]">
                              {run.card.parallel_type}
                            </span>
                          ) : null}
                          {run.card.card_number ? (
                            <span className="rounded-full border border-[color:var(--biz-border)] px-3 py-1 text-xs text-[var(--biz-text)]">
                              #{run.card.card_number}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>

                  <GradeProbabilityPanel
                    estimate={run.estimate}
                    cardIdentity={{
                      owner_declared_title: session?.cardTitle || undefined,
                      player_name: run.card.player_name,
                      year: run.card.year,
                      set_name: run.card.set_name,
                      parallel_type: run.card.parallel_type,
                      variation: run.card.variation,
                      insert: run.card.insert,
                      card_number: run.card.card_number,
                    }}
                    primaryImageUrl={run.card.imageUrl}
                    imageUrls={run.card.imageUrls}
                    scanPhotos={run.card.scanPhotos}
                    postGradingValue={run.post_grading_value}
                    headerLabel="Grade Probability Results"
                  />

                  {run.post_grading_value ? (
                    <GradeEstimatorValuePanel result={run.post_grading_value} />
                  ) : null}
                </section>
              );
            })}
          </div>
        )}
      </main>
    </>
  );
}

export default function GradeHubResultsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[var(--background)]">
          <div className="text-center">
            <div className="mx-auto mb-3 h-6 w-6 animate-spin rounded-full border-2 border-[var(--biz-primary)] border-t-transparent" />
            <p className="text-sm text-[var(--biz-muted)]">Loading results…</p>
          </div>
        </div>
      }
    >
      <ResultsPageInner />
    </Suspense>
  );
}
