"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Playfair_Display } from "next/font/google";
import { useAuth } from "@/contexts/AuthContext";
import AuthenticatedLayout from "@/components/AuthenticatedLayout";
import GradeEstimatorHistoryPanel from "@/components/grading/GradeEstimatorHistoryPanel";

const playfair = Playfair_Display({ subsets: ["latin"], weight: ["400", "600"] });

// CardzCheck blue = blue-600 (#2563eb)
const CC_BLUE = "#2563eb";
const GOLD = "#c8a951";

type CreditStatus = {
  tier: "free" | "pro" | "business";
  unlimited: boolean;
  remaining: number | null;
  nextGrantAt: string | null;
};

type Tab = "scan" | "batch" | "history";

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
  ];

  return (
    <AuthenticatedLayout>
      <div className="min-h-screen bg-[#fafafa]">

        {/* ── Tab bar ──────────────────────────────────────────────────── */}
        <div
          style={{ backgroundColor: CC_BLUE, borderBottom: `3px solid ${GOLD}` }}
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
                    borderBottom: isActive ? `3px solid ${GOLD}` : "3px solid transparent",
                    marginBottom: -3,
                    background: "transparent",
                    border: "none",
                    borderBottomWidth: 3,
                    borderBottomStyle: "solid",
                    borderBottomColor: isActive ? GOLD : "transparent",
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
              onClick={() => router.push(isBusiness ? "/grade-hub/scan?slots=1" : "/grade-hub/scan?slots=1")}
              style={{
                fontSize: 11,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.6px",
                borderRadius: 2,
                border: "none",
                color: "#1e3a8a",
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
              style={{ fontSize: 26, fontWeight: 600, color: CC_BLUE, lineHeight: 1.2 }}
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
              {/* Upload zone */}
              <div
                style={{
                  background: "#fff",
                  border: "1px solid #d0d5dd",
                  borderTop: `3px solid ${CC_BLUE}`,
                  borderRadius: 2,
                }}
              >
                {/* Main drop area */}
                <div className="flex flex-col items-center gap-4 px-8 py-10">
                  {/* Upload icon circle */}
                  <div
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: "50%",
                      border: `2px solid ${CC_BLUE}`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: CC_BLUE,
                    }}
                  >
                    <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                        d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                    </svg>
                  </div>

                  <div className="text-center space-y-1.5">
                    <p className={`${playfair.className}`} style={{ fontSize: 17, fontWeight: 600, color: "#111827" }}>
                      Drop card images here
                    </p>
                    <p style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.5, maxWidth: 420 }}>
                      Upload front &amp; back for a full grade probability breakdown across PSA &amp; BGS scales.
                    </p>
                  </div>

                  {/* Factor row */}
                  <div
                    style={{
                      border: "1px solid #d0d5dd",
                      borderRadius: 2,
                      display: "flex",
                      width: "100%",
                      maxWidth: 420,
                      overflow: "hidden",
                    }}
                  >
                    {["Centering", "Corners", "Edges", "Surface"].map((f, i) => (
                      <div
                        key={f}
                        style={{
                          flex: 1,
                          textAlign: "center",
                          padding: "8px 4px",
                          fontSize: 10,
                          fontWeight: 700,
                          textTransform: "uppercase",
                          letterSpacing: "0.8px",
                          color: "#9ca3af",
                          borderRight: i < 3 ? "1px solid #d0d5dd" : "none",
                        }}
                      >
                        {f}
                      </div>
                    ))}
                  </div>

                  {/* CTA buttons */}
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => canScan
                        ? router.push(activeTab === "batch" ? "/grade-hub/scan?slots=3" : "/grade-hub/scan?slots=1")
                        : router.push("/settings")
                      }
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.6px",
                        borderRadius: 2,
                        border: "none",
                        color: "#fff",
                        background: canScan ? CC_BLUE : "#9ca3af",
                        padding: "9px 20px",
                        cursor: canScan ? "pointer" : "not-allowed",
                      }}
                    >
                      {canScan ? "Choose files" : "No scans left"}
                    </button>
                    {isBusiness && activeTab === "scan" && (
                      <button
                        onClick={() => canScan ? router.push("/grade-hub/scan?slots=3") : undefined}
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          textTransform: "uppercase",
                          letterSpacing: "0.6px",
                          borderRadius: 2,
                          border: `1px solid ${CC_BLUE}`,
                          color: CC_BLUE,
                          background: "transparent",
                          padding: "9px 20px",
                          opacity: canScan ? 1 : 0.5,
                        }}
                      >
                        Batch scan
                      </button>
                    )}
                  </div>

                  {/* Fine print */}
                  <p style={{ fontSize: 10, color: "#d1d5db" }}>
                    {isBusiness
                      ? "Business plan · Up to 3 cards per batch · Unlimited scans"
                      : isUnlimited
                      ? "Unlimited scans"
                      : `${remaining} scan${remaining !== 1 ? "s" : ""} remaining${credits?.nextGrantAt ? ` · +1 in ${formatTimeUntil(credits.nextGrantAt)}` : ""}`
                    }
                  </p>
                </div>
              </div>

              {/* Stats strip */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4, 1fr)",
                  border: "1px solid #d0d5dd",
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
                ].map((stat, i) => (
                  <div
                    key={stat.label}
                    style={{
                      padding: "14px 16px",
                      borderRight: i < 3 ? "1px solid #d0d5dd" : "none",
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
                      style={{ fontSize: 22, fontWeight: 600, color: CC_BLUE, lineHeight: 1.1 }}
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
              {/* Section header */}
              <div className="flex items-center justify-between mb-4">
                <h2
                  className={playfair.className}
                  style={{ fontSize: 16, fontWeight: 600, color: CC_BLUE }}
                >
                  Recent scans
                </h2>
                <button
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.6px",
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
                  border: "1px solid #d0d5dd",
                  borderRadius: 2,
                  overflow: "hidden",
                }}
              >
                {/* Table header row */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "48px 1fr 120px 100px 80px 36px",
                    background: CC_BLUE,
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

                {/* History panel output */}
                <div className="divide-y divide-gray-100">
                  <GradeEstimatorHistoryPanel onSelect={() => {}} />
                </div>
              </div>
            </div>
          )}

          {/* Recent scans preview on scan/batch tabs */}
          {activeTab !== "history" && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2
                  className={playfair.className}
                  style={{ fontSize: 16, fontWeight: 600, color: CC_BLUE }}
                >
                  Recent scans
                </h2>
                <button
                  onClick={() => setActiveTab("history")}
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.6px",
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
                  border: "1px solid #d0d5dd",
                  borderRadius: 2,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "48px 1fr 120px 100px 80px 36px",
                    background: CC_BLUE,
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
