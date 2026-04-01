"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
  const router = useRouter();
  const [credits, setCredits] = useState<CreditStatus | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("scan");

  useEffect(() => {
    if (!authLoading && !authUser) router.replace("/login");
  }, [authUser, authLoading, router]);

  useEffect(() => {
    fetch("/api/grading/credits")
      .then((r) => r.json())
      .then(setCredits)
      .catch(() => {});
  }, []);

  const isBusiness = credits?.tier === "business";
  const isUnlimited = credits?.unlimited === true;
  const canScan = isUnlimited || (credits?.remaining ?? 0) > 0;
  const remaining = credits?.remaining ?? 0;

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
              }}
            >
              Settings
            </button>
            <button
              onClick={() => router.push("/grade-hub/scan?slots=1")}
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
              Upload card images — the engine scores centering, corners, edges &amp; surface and returns calibrated PSA &amp; BGS distributions.
            </p>
          </div>

          {/* ── Tab: Scan a card / Batch scan ────────────────────────── */}
          {(activeTab === "scan" || activeTab === "batch") && (
            <>
              {/* Upload zone — navy card with two explicit drop slots */}
              <div style={{ background: NAVY, borderRadius: 2, overflow: "hidden" }}>

                {/* Two-slot row */}
                <div style={{ display: "flex", alignItems: "stretch" }}>
                  {/* Front slot */}
                  <div
                    style={{
                      flex: 1,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 10,
                      padding: "36px 24px",
                      margin: 16,
                      marginRight: 8,
                      border: "1px dashed rgba(255,255,255,0.12)",
                      borderRadius: 2,
                    }}
                  >
                    <svg
                      style={{ width: 22, height: 22, color: "rgba(255,255,255,0.28)" }}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                        d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M4.5 19.5h15a.75.75 0 00.75-.75V6.75a.75.75 0 00-.75-.75H4.5a.75.75 0 00-.75.75v12a.75.75 0 00.75.75z" />
                    </svg>
                    <div style={{ textAlign: "center" }}>
                      <p style={{
                        fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.8)",
                        letterSpacing: "0.3px", marginBottom: 4,
                      }}>
                        Front of card
                      </p>
                      <p style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", lineHeight: 1.4 }}>
                        Drop image or click to upload
                      </p>
                    </div>
                  </div>

                  {/* Vertical divider */}
                  <div style={{
                    width: 1,
                    background: "rgba(255,255,255,0.07)",
                    alignSelf: "stretch",
                    margin: "16px 0",
                  }} />

                  {/* Back slot */}
                  <div
                    style={{
                      flex: 1,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 10,
                      padding: "36px 24px",
                      margin: 16,
                      marginLeft: 8,
                      border: "1px dashed rgba(255,255,255,0.12)",
                      borderRadius: 2,
                    }}
                  >
                    <svg
                      style={{ width: 22, height: 22, color: "rgba(255,255,255,0.28)" }}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                        d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M4.5 19.5h15a.75.75 0 00.75-.75V6.75a.75.75 0 00-.75-.75H4.5a.75.75 0 00-.75.75v12a.75.75 0 00.75.75z" />
                    </svg>
                    <div style={{ textAlign: "center" }}>
                      <p style={{
                        fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.8)",
                        letterSpacing: "0.3px", marginBottom: 4,
                      }}>
                        Back of card
                      </p>
                      <p style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", lineHeight: 1.4 }}>
                        Drop image or click to upload
                      </p>
                    </div>
                  </div>
                </div>

                {/* Grade category pills — keep exact structure */}
                <div
                  style={{
                    borderTop: "1px solid rgba(255,255,255,0.07)",
                    display: "flex",
                    overflow: "hidden",
                  }}
                >
                  {["Centering", "Corners", "Edges", "Surface"].map((f, i) => (
                    <div
                      key={f}
                      style={{
                        flex: 1,
                        textAlign: "center",
                        padding: "9px 4px",
                        fontSize: 10,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.8px",
                        color: "rgba(255,255,255,0.28)",
                        borderRight: i < 3 ? "1px solid rgba(255,255,255,0.07)" : "none",
                      }}
                    >
                      {f}
                    </div>
                  ))}
                </div>
              </div>

              {/* CTA buttons */}
              <div className="space-y-2.5">
                <button
                  onClick={() =>
                    canScan
                      ? router.push(activeTab === "batch" ? "/grade-hub/scan?slots=3" : "/grade-hub/scan?slots=1")
                      : router.push("/settings")
                  }
                  style={{
                    display: "block",
                    width: "100%",
                    fontSize: 12,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.6px",
                    borderRadius: 2,
                    border: "none",
                    color: "#fff",
                    background: canScan ? NAVY : "#9ca3af",
                    padding: "12px 20px",
                    cursor: canScan ? "pointer" : "not-allowed",
                    textAlign: "center",
                  }}
                >
                  {canScan ? "Analyze Card" : "No scans left"}
                </button>

                {isBusiness && activeTab === "scan" && (
                  <button
                    onClick={() => (canScan ? router.push("/grade-hub/scan?slots=3") : undefined)}
                    style={{
                      display: "block",
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
                      cursor: canScan ? "pointer" : "not-allowed",
                      opacity: canScan ? 1 : 0.5,
                      textAlign: "center",
                    }}
                  >
                    Batch Scan
                  </button>
                )}

                <p style={{ fontSize: 10, color: "#d1d5db", textAlign: "center" }}>
                  {isBusiness
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
              <div style={{ border: "1px solid #e5e7eb", borderRadius: 2, overflow: "hidden" }}>
                {/* Table header row — navy bg, white labels */}
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
              <div style={{ border: "1px solid #e5e7eb", borderRadius: 2, overflow: "hidden" }}>
                {/* Table header row — navy bg, white labels */}
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
