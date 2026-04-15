"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { Playfair_Display } from "next/font/google";
import { useAuth } from "@/contexts/AuthContext";
import AuthenticatedLayout from "@/components/AuthenticatedLayout";
import {
  loadCachedHistoryRuns,
  mergeHistoryRuns,
  removeCachedHistoryRun,
} from "@/lib/grading/gradeEstimatorHistoryCache";
import type { GradeEstimatorHistoryRun, GradeEstimate } from "@/types";

const playfair = Playfair_Display({ subsets: ["latin"], weight: ["400", "600"] });

// ── Design tokens ─────────────────────────────────────────────────────────────
const BG      = "#FFFFFF";
const SURFACE = "#F7F7F7";
const RED     = "#B91C1C";
const RED_DIM = "rgba(185,28,28,0.12)";
const TEXT    = "#111111";
const MUTED   = "#888888";
const BORDER  = "#E5E5E5";
const RED_BORDER = "rgba(185,28,28,0.25)";

// ── Types ─────────────────────────────────────────────────────────────────────
type CreditStatus = {
  tier: "free" | "pro" | "business";
  unlimited: boolean;
  remaining: number | null;
  nextGrantAt: string | null;
};

type ScanMode = "scan" | "mock";
type PageView = "home" | "history";

// ── Helpers ───────────────────────────────────────────────────────────────────
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

// ── About modal ───────────────────────────────────────────────────────────────
function AboutModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: "fixed", inset: 0,
        background: "rgba(0,0,0,0.35)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 50, padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: BG,
          border: `1px solid ${BORDER}`,
          borderTop: `3px solid ${RED}`,
          borderRadius: 2,
          padding: "32px",
          maxWidth: 460,
          width: "100%",
        }}
      >
        <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: "2px", color: RED, textTransform: "uppercase", marginBottom: 12 }}>
          About
        </p>
        <h2 className={playfair.className} style={{ fontSize: 20, color: TEXT, marginBottom: 16, lineHeight: 1.3 }}>
          Grade Probability Engine
        </h2>
        <p style={{ fontSize: 13, color: MUTED, lineHeight: 1.65, marginBottom: 12 }}>
          Uses Claude AI with vision to analyze card photos and return calibrated probability
          distributions for PSA, BGS, CGC, SGC, and Tag Rater.
        </p>
        <p style={{ fontSize: 13, color: MUTED, lineHeight: 1.65, marginBottom: 24 }}>
          Upload front, back, and close-up photos. The engine scores centering, corners, edges,
          and surface — then combines them into grade probabilities and a recommended action.
        </p>
        <p style={{ fontSize: 11, color: MUTED, marginBottom: 24, paddingTop: 12, borderTop: `1px solid ${BORDER}` }}>
          Results are predictions, not guarantees. Actual grades may vary.
        </p>
        <button
          type="button"
          onClick={onClose}
          style={{
            fontSize: 10, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase",
            color: RED, background: "none",
            border: `1px solid ${RED_BORDER}`,
            borderRadius: 2, padding: "8px 20px", cursor: "pointer",
          }}
        >
          Close
        </button>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
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

  const isBusiness = credits?.tier === "business";
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
    <AuthenticatedLayout>
      <div style={{ minHeight: "100vh", background: BG, color: TEXT }}>

        {/* ── Nav ──────────────────────────────────────────────────────── */}
        <nav style={{
          background: BG,
          borderBottom: `1px solid ${BORDER}`,
          display: "flex",
          alignItems: "stretch",
          padding: "0 32px",
        }}>
          <div style={{ flex: 1, display: "flex", alignItems: "stretch" }}>
            {/* Exit back to dashboard */}
            <Link
              href={pathname?.startsWith("/business") ? "/business" : "/"}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                fontSize: 10, fontWeight: 700, letterSpacing: "0.8px", textTransform: "uppercase",
                color: MUTED, textDecoration: "none",
                padding: "0 20px 0 0",
                marginRight: 20,
                borderRight: `1px solid ${BORDER}`,
                alignSelf: "stretch",
              }}
            >
              <svg width="10" height="10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
              </svg>
              Exit
            </Link>
            <div style={{
              display: "flex", alignItems: "center",
              paddingRight: 24, marginRight: 8,
              borderRight: `1px solid ${BORDER}`,
            }}>
              <span className={playfair.className} style={{ fontSize: 14, fontWeight: 600, color: TEXT }}>
                Grade Probability Engine
              </span>
            </div>

            {(["home", "history"] as PageView[]).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                style={{
                  padding: "0 18px",
                  fontSize: 10, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase",
                  color: view === v ? RED : MUTED,
                  background: "none", border: "none",
                  borderBottom: `2px solid ${view === v ? RED : "transparent"}`,
                  marginBottom: -1, cursor: "pointer",
                }}
              >
                {v}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setAboutOpen(true)}
              style={{
                padding: "0 18px",
                fontSize: 10, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase",
                color: MUTED, background: "none", border: "none",
                borderBottom: "2px solid transparent", marginBottom: -1, cursor: "pointer",
              }}
            >
              About
            </button>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 0" }}>
            {isBusiness && (
              <button
                type="button"
                onClick={() => router.push(`${scanPath}?slots=3&mode=scan`)}
                style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase",
                  color: MUTED, background: "none",
                  border: `1px solid ${BORDER}`, borderRadius: 2,
                  padding: "6px 14px", cursor: "pointer",
                }}
              >
                Batch Scan
              </button>
            )}
            <button
              type="button"
              onClick={() => router.push(`${scanPath}?slots=1&mode=scan`)}
              style={{
                fontSize: 10, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase",
                color: "#fff", background: RED,
                border: "none", borderRadius: 2,
                padding: "7px 16px", cursor: "pointer",
              }}
            >
              + New Scan
            </button>
          </div>
        </nav>

        {/* ════════════════════════════════════════════════════
            HOME
        ════════════════════════════════════════════════════ */}
        {view === "home" && (
          <div style={{ maxWidth: 800, margin: "0 auto", padding: "40px 32px 64px" }}>

            {/* Section label */}
            <p style={{
              fontSize: 9, fontWeight: 700, letterSpacing: "2px",
              color: RED, textTransform: "uppercase", marginBottom: 24,
            }}>
              New Analysis
            </p>

            {/* Mode + CTA card */}
            <div style={{
              background: BG,
              border: `1px solid ${BORDER}`,
              borderTop: `3px solid ${RED}`,
              borderRadius: 2,
              marginBottom: 40,
            }}>
              {/* Mode toggle */}
              <div style={{ display: "flex", borderBottom: `1px solid ${BORDER}` }}>
                {([
                  { key: "scan" as ScanMode, label: "Scan" },
                  { key: "mock" as ScanMode, label: "Mock Submission" },
                ]).map((item, i) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setMode(item.key)}
                    style={{
                      padding: "12px 24px",
                      fontSize: 11, fontWeight: 700, letterSpacing: "0.5px",
                      color: mode === item.key ? RED : MUTED,
                      background: mode === item.key ? RED_DIM : "none",
                      border: "none",
                      borderRight: i === 0 ? `1px solid ${BORDER}` : "none",
                      cursor: "pointer",
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              {/* Description + action */}
              <div style={{ padding: "20px 24px", display: "flex", alignItems: "center", gap: 24 }}>
                <p style={{ flex: 1, fontSize: 12, color: MUTED, lineHeight: 1.6 }}>
                  {mode === "scan"
                    ? "Upload card photos — the engine scores centering, corners, edges, and surface and returns calibrated probability bands for PSA, BGS, CGC, SGC, and Tag Rater."
                    : "Simulate a full grading submission. Get ROI analysis, break-even grade, and profit scenarios before sending cards."}
                </p>
                <button
                  type="button"
                  onClick={handleBeginAnalysis}
                  disabled={creditsLoading}
                  style={{
                    flexShrink: 0,
                    padding: "10px 28px",
                    fontSize: 11, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase",
                    color: "#fff", background: RED,
                    border: "none", borderRadius: 2,
                    cursor: creditsLoading ? "not-allowed" : "pointer",
                    opacity: creditsLoading ? 0.6 : 1,
                    whiteSpace: "nowrap",
                  }}
                >
                  {creditsLoading ? "Loading…" : "Begin Analysis"}
                </button>
              </div>

              {/* Credit status footer */}
              <div style={{ padding: "10px 24px", borderTop: `1px solid ${BORDER}`, background: SURFACE }}>
                <p style={{ fontSize: 10, color: MUTED }}>
                  {creditsLoading
                    ? "Checking access…"
                    : !credits
                      ? "Unable to load scan balance"
                      : isBusiness
                        ? "Business plan · unlimited scans · up to 3 cards per batch"
                        : isUnlimited
                          ? "Unlimited scans"
                          : `${remaining} scan${remaining !== 1 ? "s" : ""} remaining${credits.nextGrantAt ? ` · +1 in ${formatTimeUntil(credits.nextGrantAt)}` : ""}`}
                  {!creditsLoading && !canScan && credits && (
                    <span
                      onClick={() => router.push(pathname?.startsWith("/business") ? "/business/settings" : "/settings")}
                      style={{ color: RED, cursor: "pointer", marginLeft: 12 }}
                    >
                      Upgrade →
                    </span>
                  )}
                </p>
              </div>
            </div>

            {/* Recent Scans */}
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: "2px", color: MUTED, textTransform: "uppercase" }}>
                  Recent Scans
                </p>
                <button
                  type="button"
                  onClick={() => setView("history")}
                  style={{ fontSize: 10, color: RED, background: "none", border: "none", cursor: "pointer" }}
                >
                  View all →
                </button>
              </div>

              <div style={{ border: `1px solid ${BORDER}`, borderRadius: 2, overflow: "hidden" }}>
                {/* Header */}
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 100px 80px 90px 32px",
                  gap: 8, padding: "8px 16px",
                  background: SURFACE, borderBottom: `1px solid ${BORDER}`,
                }}>
                  {["Card", "Predicted", "Confidence", "Date", ""].map((col, i) => (
                    <span key={i} style={{ fontSize: 9, fontWeight: 700, letterSpacing: "1px", color: MUTED, textTransform: "uppercase" }}>
                      {col}
                    </span>
                  ))}
                </div>

                {/* Loading skeletons */}
                {historyLoading && recentRuns.length === 0 ? (
                  [1, 2, 3].map((i) => (
                    <div key={i} style={{
                      display: "grid", gridTemplateColumns: "1fr 100px 80px 90px 32px",
                      gap: 8, padding: "13px 16px",
                      borderBottom: i < 3 ? `1px solid ${BORDER}` : "none",
                    }}>
                      {[65, 50, 40, 50, 0].map((w, j) => w > 0 ? (
                        <div key={j} style={{ height: 10, borderRadius: 2, background: SURFACE, width: `${w}%` }} />
                      ) : <span key={j} />)}
                    </div>
                  ))
                ) : recentRuns.length === 0 ? (
                  <div style={{ padding: "32px 16px", textAlign: "center" }}>
                    <p style={{ fontSize: 12, color: MUTED }}>No scans yet. Run your first analysis.</p>
                  </div>
                ) : (
                  recentRuns.map((run, i) => {
                    const confidence = run.estimate.grade_probabilities?.confidence;
                    const confColor = confidence === "high" ? "#16a34a" : confidence === "medium" ? "#ca8a04" : MUTED;
                    return (
                      <div
                        key={run.id}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 100px 80px 90px 32px",
                          gap: 8, padding: "12px 16px", alignItems: "center",
                          borderBottom: i < recentRuns.length - 1 ? `1px solid ${BORDER}` : "none",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = SURFACE)}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                      >
                        <div style={{ minWidth: 0 }}>
                          <p style={{ fontSize: 12, color: TEXT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {run.card.player_name || "Unknown card"}
                          </p>
                          {(run.card.year || run.card.set_name) && (
                            <p style={{ fontSize: 10, color: MUTED, marginTop: 2 }}>
                              {[run.card.year, run.card.set_name].filter(Boolean).join(" · ")}
                            </p>
                          )}
                        </div>
                        <p style={{ fontFamily: "monospace", fontSize: 11, color: TEXT, fontWeight: 600 }}>
                          {formatGradeRange(run.estimate)}
                        </p>
                        <p style={{ fontSize: 10, color: confColor, textTransform: "capitalize" }}>
                          {confidence ?? "—"}
                        </p>
                        <p style={{ fontSize: 10, color: MUTED }}>{formatTimeAgo(run.created_at)}</p>
                        <button
                          type="button"
                          onClick={(e) => void handleDeleteRun(run.id, e)}
                          style={{ background: "none", border: "none", color: MUTED, cursor: "pointer", padding: 4, borderRadius: 2, display: "flex", alignItems: "center", justifyContent: "center" }}
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

        {/* ════════════════════════════════════════════════════
            HISTORY
        ════════════════════════════════════════════════════ */}
        {view === "history" && (
          <div style={{ maxWidth: 960, margin: "0 auto", padding: "40px 32px 64px" }}>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
              <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: "2px", color: RED, textTransform: "uppercase" }}>
                Analysis History
              </p>
              <p style={{ fontSize: 10, color: MUTED }}>{historyRuns.length} scan{historyRuns.length !== 1 ? "s" : ""}</p>
            </div>

            {/* Sort bar */}
            <div style={{
              display: "flex", alignItems: "center", gap: 6, marginBottom: 12,
              padding: "8px 16px",
              background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 2,
            }}>
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "1px", color: MUTED, textTransform: "uppercase", marginRight: 8 }}>Sort</span>
              {([
                { col: "date" as const, label: "Date" },
                { col: "confidence" as const, label: "Confidence" },
              ]).map(({ col, label }) => (
                <button
                  key={col}
                  type="button"
                  onClick={() => toggleSort(col)}
                  style={{
                    fontSize: 10, fontWeight: 700, letterSpacing: "0.5px",
                    color: sortBy === col ? RED : MUTED,
                    background: sortBy === col ? RED_DIM : "none",
                    border: `1px solid ${sortBy === col ? RED_BORDER : "transparent"}`,
                    borderRadius: 2, padding: "4px 10px", cursor: "pointer",
                  }}
                >
                  {label} {sortBy === col ? (sortDir === "desc" ? "↓" : "↑") : ""}
                </button>
              ))}
            </div>

            {/* Table */}
            <div style={{ border: `1px solid ${BORDER}`, borderRadius: 2, overflow: "hidden" }}>
              <div style={{
                display: "grid",
                gridTemplateColumns: "100px 1fr 110px 90px 32px",
                gap: 8, padding: "9px 16px",
                background: SURFACE, borderBottom: `1px solid ${BORDER}`,
              }}>
                {["Date", "Card", "Predicted", "Confidence", ""].map((col, i) => (
                  <span key={i} style={{ fontSize: 9, fontWeight: 700, letterSpacing: "1px", color: MUTED, textTransform: "uppercase" }}>
                    {col}
                  </span>
                ))}
              </div>

              {historyLoading ? (
                [1, 2, 3, 4, 5].map((i) => (
                  <div key={i} style={{
                    display: "grid", gridTemplateColumns: "100px 1fr 110px 90px 32px",
                    gap: 8, padding: "13px 16px",
                    borderBottom: `1px solid ${BORDER}`,
                  }}>
                    {[50, 65, 40, 40, 0].map((w, j) => w > 0 ? (
                      <div key={j} style={{ height: 10, borderRadius: 2, background: SURFACE, width: `${w}%` }} />
                    ) : <span key={j} />)}
                  </div>
                ))
              ) : sortedHistory.length === 0 ? (
                <div style={{ padding: "48px 24px", textAlign: "center" }}>
                  <p style={{ fontSize: 13, color: MUTED, marginBottom: 16 }}>No analyses yet. Run your first scan.</p>
                  <button
                    type="button"
                    onClick={() => setView("home")}
                    style={{
                      fontSize: 10, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase",
                      color: RED, background: "none",
                      border: `1px solid ${RED_BORDER}`, borderRadius: 2,
                      padding: "8px 20px", cursor: "pointer",
                    }}
                  >
                    Go to Home →
                  </button>
                </div>
              ) : (
                sortedHistory.map((run, i) => {
                  const isExpanded = expandedRow === run.id;
                  const confidence = run.estimate.grade_probabilities?.confidence;
                  const confColor  = confidence === "high" ? "#16a34a" : confidence === "medium" ? "#ca8a04" : MUTED;
                  const est        = run.estimate;

                  return (
                    <div key={run.id} style={{ borderBottom: i < sortedHistory.length - 1 ? `1px solid ${BORDER}` : "none" }}>
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => setExpandedRow(isExpanded ? null : run.id)}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setExpandedRow(isExpanded ? null : run.id); } }}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "100px 1fr 110px 90px 32px",
                          gap: 8, padding: "13px 16px", alignItems: "center",
                          cursor: "pointer",
                          background: isExpanded ? SURFACE : "transparent",
                        }}
                        onMouseEnter={(e) => { if (!isExpanded) e.currentTarget.style.background = SURFACE; }}
                        onMouseLeave={(e) => { if (!isExpanded) e.currentTarget.style.background = isExpanded ? SURFACE : "transparent"; }}
                      >
                        <p style={{ fontSize: 10, color: MUTED, fontFamily: "monospace" }}>
                          {formatFullDate(run.created_at)}
                        </p>
                        <div style={{ minWidth: 0 }}>
                          <p style={{ fontSize: 12, color: TEXT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {run.card.player_name || "Unknown card"}
                          </p>
                          {(run.card.year || run.card.set_name) && (
                            <p style={{ fontSize: 10, color: MUTED, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {[run.card.year, run.card.set_name, run.card.parallel_type].filter(Boolean).join(" · ")}
                            </p>
                          )}
                        </div>
                        <p style={{ fontFamily: "monospace", fontSize: 11, color: TEXT, fontWeight: 600 }}>
                          {formatGradeRange(run.estimate)}
                        </p>
                        <p style={{ fontSize: 10, color: confColor, textTransform: "capitalize" }}>
                          {confidence ?? "—"}
                        </p>
                        <button
                          type="button"
                          onClick={(e) => void handleDeleteRun(run.id, e)}
                          style={{ background: "none", border: "none", color: MUTED, cursor: "pointer", padding: 4, borderRadius: 2, display: "flex", alignItems: "center", justifyContent: "center" }}
                          title="Delete"
                        >
                          <svg width="11" height="11" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>

                      {isExpanded && (
                        <div style={{ padding: "16px 16px 20px", background: SURFACE, borderTop: `1px solid ${BORDER}` }}>
                          <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: "1.5px", color: RED, textTransform: "uppercase", marginBottom: 12 }}>
                            AI Reasoning
                          </p>
                          {(est.centering || est.corners || est.edges || est.surface) && (
                            <div style={{ display: "flex", gap: 32, marginBottom: 12 }}>
                              {[
                                { label: "Centering", val: est.centering },
                                { label: "Corners",   val: est.corners },
                                { label: "Edges",     val: est.edges },
                                { label: "Surface",   val: est.surface },
                              ].map(({ label, val }) => val ? (
                                <div key={label}>
                                  <p style={{ fontSize: 9, color: MUTED, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 3 }}>{label}</p>
                                  <p style={{ fontFamily: "monospace", fontSize: 13, color: TEXT, fontWeight: 600 }}>{val}</p>
                                </div>
                              ) : null)}
                            </div>
                          )}
                          <p style={{ fontSize: 12, color: MUTED, lineHeight: 1.6, maxWidth: 600 }}>
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
    </AuthenticatedLayout>
  );
}
