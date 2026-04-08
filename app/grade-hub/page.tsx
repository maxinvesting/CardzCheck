"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Playfair_Display } from "next/font/google";
import dynamic from "next/dynamic";
import { useAuth } from "@/contexts/AuthContext";
import AuthenticatedLayout from "@/components/AuthenticatedLayout";
import CardScanSlot from "@/components/grading/CardScanSlot";
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
  /** Remount scan slots for a fresh session without navigating away */
  const [hubScanKey, setHubScanKey] = useState(0);
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

  const scanDisabled = creditsLoading || (!creditsError && !canScan);

  const hubScanGridClass =
    scanSlotsForTab === 1
      ? "max-w-2xl mx-auto"
      : "grid grid-cols-1 lg:grid-cols-3 gap-5";

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
              onClick={() => setHubScanKey((k) => k + 1)}
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
              {/* Inline scan — same upload + analysis as /grade-hub/scan, without leaving the hub */}
              <div id="grade-hub-scan-workspace">
                <div
                  className="rounded-sm border border-[#e5e7eb] overflow-hidden shadow-sm [&_.cc-surface]:!bg-[#101f36] [&_.cc-surface]:!border-[rgba(255,255,255,0.08)]"
                >
                  <div key={hubScanKey} className={hubScanGridClass}>
                    {Array.from({ length: scanSlotsForTab }).map((_, i) => (
                      <CardScanSlot
                        key={i}
                        slotIndex={i}
                        totalSlots={scanSlotsForTab}
                        disabled={scanDisabled}
                      />
                    ))}
                  </div>
                </div>

                {creditsError && (
                  <div className="mt-3 flex flex-col gap-2 rounded border border-amber-200 bg-amber-50 px-3 py-2.5">
                    <p className="text-xs text-amber-900">
                      Couldn&apos;t load scan credits. You can still run an analysis; limits are enforced on the server.
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

                {isBusiness && activeTab === "scan" && (
                  <div style={{ marginTop: 12 }}>
                    <button
                      type="button"
                      onClick={() => {
                        if (creditsLoading || (!creditsError && !canScan)) return;
                        setActiveTab("batch");
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
                      Batch scan (up to 3 cards)
                    </button>
                  </div>
                )}

                <p style={{ fontSize: 10, color: "#9ca3af", marginTop: 10, textAlign: "center" }}>
                  {creditsLoading
                    ? "Loading scan balance…"
                    : creditsError
                      ? "Credit balance unavailable — try uploading when you’re ready."
                      : isBusiness
                        ? "Business plan · Up to 3 cards per batch · Unlimited scans"
                        : isUnlimited
                          ? "Unlimited scans"
                          : `${remaining} scan${remaining !== 1 ? "s" : ""} remaining${credits?.nextGrantAt ? ` · +1 in ${formatTimeUntil(credits.nextGrantAt)}` : ""}`}
                </p>
                <p style={{ fontSize: 10, color: "#9ca3af", marginTop: 6, textAlign: "center" }}>
                  <button
                    type="button"
                    onClick={() => openScanSession(scanSlotsForTab)}
                    className="text-[#6b7280] underline underline-offset-2 hover:text-[#374151]"
                  >
                    Open full-screen scan workspace
                  </button>{" "}
                  if you prefer the dedicated session view.
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
