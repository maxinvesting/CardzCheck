"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import {
  loadCachedHistoryRuns,
  mergeHistoryRuns,
  removeCachedHistoryRun,
} from "@/lib/grading/gradeEstimatorHistoryCache";
import type { GradeEstimatorHistoryRun, GradeEstimate } from "@/types";

type CreditStatus = {
  tier: "free" | "pro" | "business" | "business_pro";
  unlimited: boolean;
  remaining: number | null;
  nextGrantAt: string | null;
  maxCardsPerSession?: number;
};

type ScanMode = "scan" | "mock";
type PageView = "home" | "history";

function formatTimeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60)     return "just now";
  if (seconds < 3600)   return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400)  return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatFullDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "numeric",
  });
}

function formatGradeRange(estimate: GradeEstimate): string {
  const low  = estimate.estimated_grade_low;
  const high = estimate.estimated_grade_high;
  if (!low || !high) return "—";
  const fmt = (v: number) => Number.isInteger(v) ? String(v) : v.toFixed(1).replace(/\.0$/, "");
  return low === high ? `PSA ${fmt(low)}` : `PSA ${fmt(low)}–${fmt(high)}`;
}

function formatTimeUntil(iso: string | null): string {
  if (!iso) return "";
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "soon";
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (d > 0) return `${d}d ${h}h`;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function AboutModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[460px] rounded-md border border-[#24282D] bg-[#0F1317] p-8"
      >
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#77808C]">
          About
        </p>
        <h2 className="mb-4 text-[18px] font-semibold leading-tight text-[#E6E8EB]">
          Grade Probability Engine
        </h2>
        <p className="mb-3 text-[13px] leading-relaxed text-[#B8C0CC]">
          Uses Claude AI with vision to analyze card photos and return calibrated probability
          distributions for PSA, BGS, CGC, SGC, and Tag Rater.
        </p>
        <p className="mb-6 text-[13px] leading-relaxed text-[#B8C0CC]">
          Upload front, back, and close-up photos. The engine scores centering, corners, edges,
          and surface — then combines them into grade probabilities and a recommended action.
        </p>
        <p className="mb-6 border-t border-[#24282D] pt-3 text-[11px] text-[#77808C]">
          Results are predictions, not guarantees. Actual grades may vary.
        </p>
        <button
          type="button"
          onClick={onClose}
          className="rounded border border-[#343941] px-4 py-2 text-[11px] font-medium text-[#B8C0CC] transition-colors hover:border-[#5A626E] hover:text-[#E6E8EB]"
        >
          Close
        </button>
      </div>
    </div>
  );
}

export default function GradeHubPage() {
  const { authUser, loading: authLoading } = useAuth();
  const router   = useRouter();
  const pathname = usePathname();

  const scanBasePath = pathname?.startsWith("/business") ? "/business/grade-hub" : "/grade-hub";
  const scanPath     = `${scanBasePath}/scan`;

  const [view,           setView]          = useState<PageView>("home");
  const [mode,           setMode]          = useState<ScanMode>("scan");
  const [aboutOpen,      setAboutOpen]     = useState(false);
  const [credits,        setCredits]       = useState<CreditStatus | null>(null);
  const [creditsLoading, setCreditsLoading]= useState(true);
  const [recentRuns,     setRecentRuns]    = useState<GradeEstimatorHistoryRun[]>([]);
  const [historyRuns,    setHistoryRuns]   = useState<GradeEstimatorHistoryRun[]>([]);
  const [historyLoading, setHistoryLoading]= useState(false);
  const [expandedRow,    setExpandedRow]   = useState<string | null>(null);
  const [sortBy,         setSortBy]        = useState<"date" | "confidence">("date");
  const [sortDir,        setSortDir]       = useState<"desc" | "asc">("desc");

  useEffect(() => {
    if (!authLoading && !authUser) router.replace("/login");
  }, [authUser, authLoading, router]);

  useEffect(() => {
    if (authLoading || !authUser) return;
    fetch("/api/grading/credits")
      .then((r) => r.json())
      .then((d: CreditStatus) => setCredits(d))
      .catch(() => {})
      .finally(() => setCreditsLoading(false));
  }, [authLoading, authUser]);

  const loadHistory = useCallback(async () => {
    const cached = loadCachedHistoryRuns();
    setRecentRuns(cached.slice(0, 5));
    setHistoryLoading(true);
    try {
      const res  = await fetch("/api/grade-estimator/history");
      if (!res.ok) { setRecentRuns(cached.slice(0, 5)); setHistoryRuns(cached); return; }
      const data = await res.json();
      if (Array.isArray(data?.runs)) {
        const merged = mergeHistoryRuns(data.runs, cached);
        setRecentRuns(merged.slice(0, 5));
        setHistoryRuns(merged);
      }
    } catch {
      setRecentRuns(cached.slice(0, 5));
      setHistoryRuns(cached);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && authUser) void loadHistory();
  }, [authLoading, authUser, loadHistory]);

  const handleBeginAnalysis = useCallback(() => {
    router.push(`${scanPath}?slots=1&mode=${mode}`);
  }, [router, scanPath, mode]);

  const handleDeleteRun = useCallback(async (runId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setRecentRuns((p) => p.filter((r) => r.id !== runId));
    setHistoryRuns((p) => p.filter((r) => r.id !== runId));
    removeCachedHistoryRun(runId);
    await fetch(`/api/grade-estimator/history?id=${encodeURIComponent(runId)}`, { method: "DELETE" }).catch(() => {});
  }, []);

  // Multi-card "Batch Scan" is Pro-only post-PR C1.
  const isBusinessPro =
    credits?.tier === "business_pro" || (credits?.maxCardsPerSession ?? 0) > 1;
  const isUnlimited = credits?.unlimited === true;
  const remaining  = credits?.remaining ?? 0;
  const canScan    = !creditsLoading && credits !== null && (isUnlimited || remaining > 0);

  const sortedHistory = [...historyRuns].sort((a, b) => {
    const mult = sortDir === "desc" ? -1 : 1;
    if (sortBy === "date") {
      return mult * (new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    }
    const confOrder: Record<string, number> = { high: 3, medium: 2, low: 1 };
    const ca = confOrder[a.estimate.grade_probabilities?.confidence ?? "low"] ?? 0;
    const cb = confOrder[b.estimate.grade_probabilities?.confidence ?? "low"] ?? 0;
    return mult * (ca - cb);
  });

  const toggleSort = (col: typeof sortBy) => {
    if (sortBy === col) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortBy(col); setSortDir("desc"); }
  };

  return (
    <>
      <div className="min-h-screen bg-[#090B0D] text-[#E6E8EB]">

        {/* Page header */}
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#24282D] px-4 py-3">
          <div>
            <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-[#77808C]">
              Analytics
            </div>
            <h1 className="mt-0.5 flex items-center gap-3 text-[18px] font-semibold tracking-normal text-[#E6E8EB]">
              Grading
              <button
                type="button"
                onClick={() => setAboutOpen(true)}
                className="text-[10px] font-medium uppercase tracking-[0.12em] text-[#77808C] hover:text-[#B8C0CC]"
              >
                About
              </button>
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setView(view === "history" ? "home" : "history")}
              className="border border-[#343941] px-3 py-1.5 text-[12px] font-medium text-[#B8C0CC] transition-colors hover:border-[#5A626E] hover:text-[#E6E8EB]"
            >
              {view === "history" ? "← Home" : "History"}
            </button>
            {isBusinessPro && (
              <button
                type="button"
                onClick={() => router.push(`${scanPath}?slots=3&mode=scan`)}
                className="border border-[#343941] px-3 py-1.5 text-[12px] font-medium text-[#B8C0CC] transition-colors hover:border-[#5A626E] hover:text-[#E6E8EB]"
              >
                Batch Scan
              </button>
            )}
            <button
              type="button"
              onClick={() => router.push(`${scanPath}?slots=1&mode=scan`)}
              className="border border-[#20B26B] bg-[#20B26B] px-3 py-1.5 text-[12px] font-semibold text-[#07100B] transition-colors hover:bg-[#33C47C]"
            >
              + New Scan
            </button>
          </div>
        </header>

        {/* HOME */}
        {view === "home" && (
          <div className="mx-auto max-w-[800px] px-8 py-10">

            <p className="mb-6 text-[10px] font-medium uppercase tracking-[0.16em] text-[#77808C]">
              New Analysis
            </p>

            <div className="mb-10 border border-[#24282D] bg-[#0F1317]">
              {/* Mode toggle */}
              <div className="flex border-b border-[#24282D]">
                {([
                  { key: "scan" as ScanMode, label: "Scan" },
                  { key: "mock" as ScanMode, label: "Mock Submission" },
                ]).map((item, i) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setMode(item.key)}
                    className={`px-6 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] transition-colors ${
                      mode === item.key
                        ? "border-b-2 border-[#E6E8EB] text-[#E6E8EB] -mb-px"
                        : "text-[#77808C] hover:text-[#B8C0CC]"
                    } ${i === 0 ? "border-r border-[#24282D]" : ""}`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-6 px-6 py-5">
                <p className="flex-1 text-[12px] leading-relaxed text-[#B8C0CC]">
                  {mode === "scan"
                    ? "Upload card photos — the engine scores centering, corners, edges, and surface and returns calibrated probability bands for PSA, BGS, CGC, SGC, and Tag Rater."
                    : "Simulate a full grading submission. Get ROI analysis, break-even grade, and profit scenarios before sending cards."}
                </p>
                <button
                  type="button"
                  onClick={handleBeginAnalysis}
                  disabled={creditsLoading}
                  className="flex-shrink-0 whitespace-nowrap border border-[#20B26B] bg-[#20B26B] px-7 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#07100B] transition-colors hover:bg-[#33C47C] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {creditsLoading ? "Loading…" : "Begin Analysis"}
                </button>
              </div>

              <div className="border-t border-[#24282D] bg-[#0B0D0F] px-6 py-2.5">
                <p className="text-[10px] text-[#77808C]">
                  {creditsLoading
                    ? "Checking access…"
                    : !credits
                      ? "Unable to load scan balance"
                      : isBusinessPro
                        ? "Business Pro · unlimited scans · up to 3 cards per batch"
                        : isUnlimited
                          ? "Unlimited scans"
                          : `${remaining} scan${remaining !== 1 ? "s" : ""} remaining${credits.nextGrantAt ? ` · +1 in ${formatTimeUntil(credits.nextGrantAt)}` : ""}`}
                  {!creditsLoading && !canScan && credits && (
                    <span
                      onClick={() => router.push(pathname?.startsWith("/business") ? "/business/settings" : "/settings")}
                      className="ml-3 cursor-pointer text-[#20B26B] hover:text-[#33C47C]"
                    >
                      Upgrade →
                    </span>
                  )}
                </p>
              </div>
            </div>

            {/* Recent Scans */}
            <div>
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-[#77808C]">
                  Recent Scans
                </p>
                <button
                  type="button"
                  onClick={() => setView("history")}
                  className="text-[10px] text-[#B8C0CC] hover:text-[#E6E8EB]"
                >
                  View all →
                </button>
              </div>

              <div className="overflow-hidden border border-[#24282D]">
                <div
                  className="grid gap-2 border-b border-[#24282D] bg-[#0B0D0F] px-4 py-2"
                  style={{ gridTemplateColumns: "1fr 100px 80px 90px 32px" }}
                >
                  {["Card", "Predicted", "Confidence", "Date", ""].map((col, i) => (
                    <span key={i} className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[#77808C]">
                      {col}
                    </span>
                  ))}
                </div>

                {historyLoading && recentRuns.length === 0 ? (
                  [1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className={`grid gap-2 px-4 py-3 ${i < 3 ? "border-b border-[#24282D]" : ""}`}
                      style={{ gridTemplateColumns: "1fr 100px 80px 90px 32px" }}
                    >
                      {[65, 50, 40, 50, 0].map((w, j) => w > 0 ? (
                        <div key={j} className="h-2.5 rounded-sm bg-[#161616]" style={{ width: `${w}%` }} />
                      ) : <span key={j} />)}
                    </div>
                  ))
                ) : recentRuns.length === 0 ? (
                  <div className="px-4 py-8 text-center">
                    <p className="text-[12px] text-[#77808C]">No scans yet. Run your first analysis.</p>
                  </div>
                ) : (
                  recentRuns.map((run, i) => {
                    const confidence = run.estimate.grade_probabilities?.confidence;
                    const confColor = confidence === "high" ? "text-[#20B26B]" : confidence === "medium" ? "text-[#C9A227]" : "text-[#77808C]";
                    return (
                      <div
                        key={run.id}
                        className={`grid items-center gap-2 px-4 py-3 transition-colors hover:bg-[#13171B] ${i < recentRuns.length - 1 ? "border-b border-[#24282D]" : ""}`}
                        style={{ gridTemplateColumns: "1fr 100px 80px 90px 32px" }}
                      >
                        <div className="min-w-0">
                          <p className="truncate text-[12px] text-[#E6E8EB]">
                            {run.card.player_name || "Unknown card"}
                          </p>
                          {(run.card.year || run.card.set_name) && (
                            <p className="mt-0.5 text-[10px] text-[#77808C]">
                              {[run.card.year, run.card.set_name].filter(Boolean).join(" · ")}
                            </p>
                          )}
                        </div>
                        <p className="font-mono text-[11px] font-semibold text-[#E6E8EB]">
                          {formatGradeRange(run.estimate)}
                        </p>
                        <p className={`text-[10px] capitalize ${confColor}`}>
                          {confidence ?? "—"}
                        </p>
                        <p className="text-[10px] text-[#77808C]">{formatTimeAgo(run.created_at)}</p>
                        <button
                          type="button"
                          onClick={(e) => void handleDeleteRun(run.id, e)}
                          className="flex items-center justify-center rounded p-1 text-[#77808C] transition-colors hover:text-[#dc2626]"
                          title="Delete"
                        >
                          <svg width="11" height="11" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}

        {/* HISTORY */}
        {view === "history" && (
          <div className="mx-auto max-w-[960px] px-8 py-10">

            <div className="mb-6 flex items-center justify-between">
              <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-[#77808C]">
                Analysis History
              </p>
              <p className="text-[10px] text-[#77808C]">
                {historyRuns.length} scan{historyRuns.length !== 1 ? "s" : ""}
              </p>
            </div>

            <div className="mb-3 flex items-center gap-1.5 border border-[#24282D] bg-[#0B0D0F] px-4 py-2">
              <span className="mr-2 text-[9px] font-semibold uppercase tracking-[0.12em] text-[#77808C]">Sort</span>
              {([
                { col: "date" as const, label: "Date" },
                { col: "confidence" as const, label: "Confidence" },
              ]).map(({ col, label }) => (
                <button
                  key={col}
                  type="button"
                  onClick={() => toggleSort(col)}
                  className={`border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.06em] transition-colors ${
                    sortBy === col
                      ? "border-[#5A626E] bg-[#13171B] text-[#E6E8EB]"
                      : "border-transparent text-[#77808C] hover:text-[#B8C0CC]"
                  }`}
                >
                  {label} {sortBy === col ? (sortDir === "desc" ? "↓" : "↑") : ""}
                </button>
              ))}
            </div>

            <div className="overflow-hidden border border-[#24282D]">
              <div
                className="grid gap-2 border-b border-[#24282D] bg-[#0B0D0F] px-4 py-2"
                style={{ gridTemplateColumns: "100px 1fr 110px 90px 32px" }}
              >
                {["Date", "Card", "Predicted", "Confidence", ""].map((col, i) => (
                  <span key={i} className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[#77808C]">
                    {col}
                  </span>
                ))}
              </div>

              {historyLoading ? (
                [1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    className="grid gap-2 border-b border-[#24282D] px-4 py-3"
                    style={{ gridTemplateColumns: "100px 1fr 110px 90px 32px" }}
                  >
                    {[50, 65, 40, 40, 0].map((w, j) => w > 0 ? (
                      <div key={j} className="h-2.5 rounded-sm bg-[#161616]" style={{ width: `${w}%` }} />
                    ) : <span key={j} />)}
                  </div>
                ))
              ) : sortedHistory.length === 0 ? (
                <div className="px-6 py-12 text-center">
                  <p className="mb-4 text-[13px] text-[#77808C]">No analyses yet. Run your first scan.</p>
                  <button
                    type="button"
                    onClick={() => setView("home")}
                    className="border border-[#343941] px-5 py-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#B8C0CC] transition-colors hover:border-[#5A626E] hover:text-[#E6E8EB]"
                  >
                    Go to Home →
                  </button>
                </div>
              ) : (
                sortedHistory.map((run, i) => {
                  const isExpanded = expandedRow === run.id;
                  const confidence = run.estimate.grade_probabilities?.confidence;
                  const confColor  = confidence === "high" ? "text-[#20B26B]" : confidence === "medium" ? "text-[#C9A227]" : "text-[#77808C]";
                  const est        = run.estimate;

                  return (
                    <div key={run.id} className={i < sortedHistory.length - 1 ? "border-b border-[#24282D]" : ""}>
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => setExpandedRow(isExpanded ? null : run.id)}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setExpandedRow(isExpanded ? null : run.id); } }}
                        className={`grid cursor-pointer items-center gap-2 px-4 py-3 transition-colors ${
                          isExpanded ? "bg-[#13171B]" : "hover:bg-[#13171B]"
                        }`}
                        style={{ gridTemplateColumns: "100px 1fr 110px 90px 32px" }}
                      >
                        <p className="font-mono text-[10px] text-[#77808C]">
                          {formatFullDate(run.created_at)}
                        </p>
                        <div className="min-w-0">
                          <p className="truncate text-[12px] text-[#E6E8EB]">
                            {run.card.player_name || "Unknown card"}
                          </p>
                          {(run.card.year || run.card.set_name) && (
                            <p className="mt-0.5 truncate text-[10px] text-[#77808C]">
                              {[run.card.year, run.card.set_name, run.card.parallel_type].filter(Boolean).join(" · ")}
                            </p>
                          )}
                        </div>
                        <p className="font-mono text-[11px] font-semibold text-[#E6E8EB]">
                          {formatGradeRange(run.estimate)}
                        </p>
                        <p className={`text-[10px] capitalize ${confColor}`}>
                          {confidence ?? "—"}
                        </p>
                        <button
                          type="button"
                          onClick={(e) => void handleDeleteRun(run.id, e)}
                          className="flex items-center justify-center rounded p-1 text-[#77808C] transition-colors hover:text-[#dc2626]"
                          title="Delete"
                        >
                          <svg width="11" height="11" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>

                      {isExpanded && (
                        <div className="border-t border-[#24282D] bg-[#0B0D0F] px-4 pb-5 pt-4">
                          <p className="mb-3 text-[9px] font-semibold uppercase tracking-[0.16em] text-[#77808C]">
                            AI Reasoning
                          </p>
                          {(est.centering || est.corners || est.edges || est.surface) && (
                            <div className="mb-3 flex gap-8">
                              {[
                                { label: "Centering", val: est.centering },
                                { label: "Corners",   val: est.corners },
                                { label: "Edges",     val: est.edges },
                                { label: "Surface",   val: est.surface },
                              ].map(({ label, val }) => val ? (
                                <div key={label}>
                                  <p className="mb-1 text-[9px] uppercase tracking-[0.08em] text-[#77808C]">{label}</p>
                                  <p className="font-mono text-[13px] font-semibold text-[#E6E8EB]">{val}</p>
                                </div>
                              ) : null)}
                            </div>
                          )}
                          <p className="max-w-[600px] text-[12px] leading-relaxed text-[#B8C0CC]">
                            {est.grade_notes || "No detailed notes for this scan."}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {aboutOpen && <AboutModal onClose={() => setAboutOpen(false)} />}
      </div>
    </>
  );
}
