"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Playfair_Display } from "next/font/google";
import dynamic from "next/dynamic";
import { useAuth } from "@/contexts/AuthContext";
import AuthenticatedLayout from "@/components/AuthenticatedLayout";
import GradeEstimatorHistoryPanel from "@/components/grading/GradeEstimatorHistoryPanel";

// Lazy-load the heavy submission builder only when the tab is active
const SubmissionsTabContent = dynamic(
  () => import("@/components/grading/SubmissionsTabContent"),
  { ssr: false, loading: () => <div className="py-12 text-center text-sm text-gray-400">Loading submissions…</div> }
);

const playfair = Playfair_Display({ subsets: ["latin"], weight: ["400", "600"] });

const NAVY = "#0B1829";
const GOLD = "#B9A96A";

type CreditStatus = {
  tier: "free" | "pro" | "business";
  unlimited: boolean;
  remaining: number | null;
  nextGrantAt: string | null;
};

type Tab = "scan" | "batch" | "history" | "submissions";

type CreditsFetchState = "loading" | "ready" | "error";

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

export default function GradeHubPage() {
  const { authUser, loading: authLoading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [credits, setCredits] = useState<CreditStatus | null>(null);
  const [creditsFetchState, setCreditsFetchState] = useState<CreditsFetchState>("loading");
  const [activeTab, setActiveTab] = useState<Tab>("scan");
  const gradeHubBasePath = pathname?.startsWith("/business") ? "/business/grade-hub" : "/grade-hub";
  const gradeHubScanPath = `${gradeHubBasePath}/scan`;

  const loadCredits = useCallback(() => {
    setCreditsFetchState("loading");
    fetch("/api/grading/credits")
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data?.error ?? "Request failed");
        if (data?.error) throw new Error(data.error);
        return data as CreditStatus;
      })
      .then((data) => {
        setCredits(data);
        setCreditsFetchState("ready");
      })
      .catch(() => {
        setCreditsFetchState("error");
      });
  }, []);

  useEffect(() => {
    if (!authLoading && !authUser) router.replace("/login");
  }, [authUser, authLoading, router]);

  useEffect(() => {
    if (authLoading || !authUser) return;
    loadCredits();
  }, [authLoading, authUser, loadCredits]);

  const isBusiness = credits?.tier === "business";
  const isUnlimited = credits?.unlimited === true;
  const canScan =
    creditsFetchState === "ready" &&
    credits !== null &&
    (isUnlimited || (credits.remaining ?? 0) > 0);
  const remaining = credits?.remaining ?? 0;
  const creditsLoading = creditsFetchState === "loading";
  const creditsError = creditsFetchState === "error";

  const scanSlotsForTab = activeTab === "batch" ? 3 : 1;

  const openScanSession = useCallback(
    (slots: number) => {
      router.push(`${gradeHubScanPath}?slots=${slots}`);
    },
    [gradeHubScanPath, router]
  );

  const handlePrimaryAnalyze = useCallback(() => {
    if (creditsLoading) return;
    if (creditsError) {
      openScanSession(scanSlotsForTab);
      return;
    }
    if (canScan) openScanSession(scanSlotsForTab);
    else router.push("/settings");
  }, [canScan, creditsError, creditsLoading, openScanSession, router, scanSlotsForTab]);

  const tabs: { key: Tab; label: string; show: boolean }[] = [
    { key: "scan", label: "Scan a card", show: true },
    { key: "batch", label: "Batch scan", show: isBusiness },
    { key: "history", label: "History", show: true },
    { key: "submissions", label: "Submissions", show: true },
  ];

  return (
    <AuthenticatedLayout>
      <div className="min-h-screen bg-[#fafafa]">

        {/* ── Tab bar ──────────────────────────────────────────────────── */}
        <div
          style={{ backgroundColor: NAVY, borderBottom: `3px solid ${GOLD}` }}
          className="flex items-center gap-0 px-6"
        >
          {/* Tabs */}
          <div className="flex items-stretch flex-1">
            {tabs.filter((t) => t.show).map((tab) => {
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className="relative px-5 py-3.5 transition-colors"
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.6px",
                    color: isActive ? "#fff" : "rgba(255,255,255,0.55)",
                    background: "transparent",
                    border: "none",
                    borderBottomWidth: 3,
                    borderBottomStyle: "solid",
                    borderBottomColor: isActive ? GOLD : "transparent",
                    marginBottom: -3,
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Right-side action buttons */}
          <div className="flex items-center gap-2 py-2">
            <button
              type="button"
              onClick={() =>
                router.push(pathname?.startsWith("/business") ? "/business/settings" : "/settings")
              }
              style={{
                fontSize: 11,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.6px",
                borderRadius: 2,
                border: "1px solid rgba(255,255,255,0.6)",
                color: "#fff",
                background: "transparent",
                padding: "6px 14px",
                cursor: "pointer",
              }}
            >
              Settings
            </button>
            <button
              type="button"
              onClick={() => openScanSession(1)}
              style={{
                fontSize: 11,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.6px",
                borderRadius: 2,
                border: "none",
                color: NAVY,
                background: GOLD,
                padding: "6px 14px",
              }}
            >
              New scan
            </button>
          </div>
        </div>

        {/* ── Body ─────────────────────────────────────────────────────── */}
        <div className="px-6 py-8 max-w-4xl mx-auto space-y-7">

          {/* ── Page header ──────────────────────────────────────────── */}
          <div className="space-y-1">
            <p
              style={{
                fontSize: 10,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "1.2px",
                color: GOLD,
              }}
            >
              Grade Probability Engine
            </p>
            <h1
              className={playfair.className}
              style={{ fontSize: 26, fontWeight: 600, color: NAVY, lineHeight: 1.2 }}
            >
              Estimate your grade odds.
            </h1>
            <p style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.5, maxWidth: 560 }}>
              Upload card images — the engine scores centering, corners, edges &amp; surface and returns calibrated probability bands for PSA, BGS, CGC, SGC, and Tag Rater.
            </p>
          </div>

          {/* ── Tab: Scan a card / Batch scan ────────────────────────── */}
          {(activeTab === "scan" || activeTab === "batch") && (
            <>
              {/* Scan entry — opens real upload flow on /scan */}
              <div>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => openScanSession(scanSlotsForTab)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openScanSession(scanSlotsForTab);
                    }
                  }}
                  style={{ background: NAVY, borderRadius: 2, padding: "24px", cursor: "pointer" }}
                >
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1px 1fr" }}>
                    <div style={{ padding: "0 16px 0 0", display: "flex", flexDirection: "column" }}>
                      <div
                        style={{
                          border: "1px dashed rgba(255,255,255,0.2)",
                          borderRadius: 2,
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 10,
                          padding: "36px 16px",
                          flex: 1,
                        }}
                      >
                        <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: "rgba(255,255,255,0.35)" }}>
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6}
                            d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                        </svg>
                        <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.8px", color: "rgba(255,255,255,0.85)", margin: 0 }}>
                          Front of card
                        </p>
                        <p style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", textAlign: "center", margin: 0, lineHeight: 1.4 }}>
                          Added on the scan page
                        </p>
                      </div>
                    </div>
                    <div style={{ background: "rgba(255,255,255,0.08)", margin: "8px 0" }} />
                    <div style={{ padding: "0 0 0 16px", display: "flex", flexDirection: "column" }}>
                      <div
                        style={{
                          border: "1px dashed rgba(255,255,255,0.2)",
                          borderRadius: 2,
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 10,
                          padding: "36px 16px",
                          flex: 1,
                        }}
                      >
                        <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: "rgba(255,255,255,0.35)" }}>
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6}
                            d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                        </svg>
                        <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.8px", color: "rgba(255,255,255,0.85)", margin: 0 }}>
                          Back of card
                        </p>
                        <p style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", textAlign: "center", margin: 0, lineHeight: 1.4 }}>
                          Added on the scan page
                        </p>
                      </div>
                    </div>
                  </div>
                  <p
                    style={{
                      fontSize: 11,
                      color: "rgba(255,255,255,0.5)",
                      textAlign: "center",
                      margin: "16px 0 0",
                      lineHeight: 1.45,
                    }}
                  >
                    Click here to open your scan session — upload front, back, and optional close-ups on the next screen.
                  </p>
                </div>

                {creditsError && (
                  <div className="mt-3 flex flex-col gap-2 rounded border border-amber-200 bg-amber-50 px-3 py-2.5">
                    <p className="text-xs text-amber-900">
                      Couldn&apos;t load scan credits. You can still open a scan session; limits are enforced when you run an analysis.
                    </p>
                    <button
                      type="button"
                      onClick={() => loadCredits()}
                      className="self-start text-xs font-semibold text-amber-900 underline underline-offset-2 hover:text-amber-950"
                    >
                      Retry
                    </button>
                  </div>
                )}

                <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                  <button
                    type="button"
                    onClick={handlePrimaryAnalyze}
                    disabled={creditsLoading}
                    style={{
                      width: "100%",
                      fontSize: 12,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.6px",
                      borderRadius: 2,
                      border: "none",
                      color: "#fff",
                      background: creditsLoading
                        ? "#9ca3af"
                        : creditsError || canScan
                          ? NAVY
                          : "#9ca3af",
                      padding: "11px 20px",
                      cursor: creditsLoading ? "not-allowed" : "pointer",
                    }}
                  >
                    {creditsLoading
                      ? "Checking scan access…"
                      : creditsError
                        ? "Open scan session"
                        : canScan
                          ? "Analyze Card"
                          : "No scans left"}
                  </button>
                  {isBusiness && activeTab === "scan" && (
                    <button
                      type="button"
                      onClick={() => {
                        if (creditsLoading) return;
                        if (creditsError || canScan) openScanSession(3);
                      }}
                      disabled={creditsLoading || (!creditsError && !canScan)}
                      style={{
                        width: "100%",
                        fontSize: 12,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.6px",
                        borderRadius: 2,
                        border: `1px solid ${NAVY}`,
                        color: NAVY,
                        background: "transparent",
                        padding: "11px 20px",
                        cursor:
                          creditsLoading || (!creditsError && !canScan) ? "not-allowed" : "pointer",
                        opacity: creditsLoading || (!creditsError && !canScan) ? 0.5 : 1,
                      }}
                    >
                      Batch Scan
                    </button>
                  )}
                </div>

                <p style={{ fontSize: 10, color: "#9ca3af", marginTop: 10, textAlign: "center" }}>
                  {creditsLoading
                    ? "Loading scan balance…"
                    : creditsError
                      ? "Credit balance unavailable — open a session to continue."
                      : isBusiness
                        ? "Business plan · Up to 3 cards per batch · Unlimited scans"
                        : isUnlimited
                          ? "Unlimited scans"
                          : `${remaining} scan${remaining !== 1 ? "s" : ""} remaining${credits?.nextGrantAt ? ` · +1 in ${formatTimeUntil(credits.nextGrantAt)}` : ""}`}
                </p>
              </div>

              {/* Stats strip — keep exact structure */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4, 1fr)",
                  border: "1px solid #e5e7eb",
                  borderRadius: 2,
                  background: "#fff",
                  overflow: "hidden",
                }}
              >
                {[
                  { label: "Total scans", value: "—", delta: null },
                  { label: "Avg centering", value: "—", delta: null },
                  { label: "PSA 9+ rate", value: "—", delta: null },
                  { label: "High confidence", value: "—", delta: null },
                ].map((stat: { label: string; value: string; delta: string | null }, i) => (
                  <div
                    key={stat.label}
                    style={{
                      padding: "14px 16px",
                      borderRight: i < 3 ? "1px solid #e5e7eb" : "none",
                    }}
                  >
                    <p
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.8px",
                        color: "#9ca3af",
                        marginBottom: 4,
                      }}
                    >
                      {stat.label}
                    </p>
                    <p
                      className={playfair.className}
                      style={{ fontSize: 22, fontWeight: 600, color: NAVY, lineHeight: 1.1 }}
                    >
                      {stat.value}
                    </p>
                    {stat.delta && (
                      <p
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: stat.delta.startsWith("+") ? "#2d7a4e" : "#b91c1c",
                          marginTop: 2,
                        }}
                      >
                        {stat.delta}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ── Tab: History ─────────────────────────────────────────── */}
          {activeTab === "history" && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2
                  className={playfair.className}
                  style={{ fontSize: 16, fontWeight: 600, color: NAVY }}
                >
                  Recent scans
                </h2>
                <button
                  style={{
                    fontSize: 10,
                    fontWeight: 500,
                    color: GOLD,
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  View all →
                </button>
              </div>

              {/* History panel wrapped in table-styled container */}
              <div
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 2,
                  overflow: "hidden",
                }}
              >
                {/* Table header row */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "48px 1fr 120px 100px 80px 36px",
                    background: NAVY,
                    padding: "10px 16px",
                    gap: 8,
                  }}
                >
                  {["", "Card", "Grade range", "Confidence", "Date", ""].map((col, i) => (
                    <div
                      key={i}
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.8px",
                        color: "rgba(255,255,255,0.6)",
                      }}
                    >
                      {col}
                    </div>
                  ))}
                </div>
                <div className="divide-y divide-gray-100">
                  <GradeEstimatorHistoryPanel onSelect={() => {}} />
                </div>
              </div>
            </div>
          )}

          {/* ── Tab: Submissions ──────────────────────────────────────── */}
          {activeTab === "submissions" && (
            <SubmissionsTabContent />
          )}

          {/* Recent scans preview on scan/batch tabs */}
          {activeTab !== "history" && activeTab !== "submissions" && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2
                  className={playfair.className}
                  style={{ fontSize: 16, fontWeight: 600, color: NAVY }}
                >
                  Recent scans
                </h2>
                <button
                  onClick={() => setActiveTab("history")}
                  style={{
                    fontSize: 10,
                    fontWeight: 500,
                    color: GOLD,
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  View all →
                </button>
              </div>
              <div
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 2,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "48px 1fr 120px 100px 80px 36px",
                    background: NAVY,
                    padding: "10px 16px",
                    gap: 8,
                  }}
                >
                  {["", "Card", "Grade range", "Confidence", "Date", ""].map((col, i) => (
                    <div
                      key={i}
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.8px",
                        color: "rgba(255,255,255,0.6)",
                      }}
                    >
                      {col}
                    </div>
                  ))}
                </div>
                <div className="divide-y divide-gray-100">
                  <GradeEstimatorHistoryPanel onSelect={() => {}} />
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </AuthenticatedLayout>
  );
}
