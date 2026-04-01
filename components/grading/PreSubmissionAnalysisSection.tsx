"use client";

import { useEffect, useMemo, useState } from "react";
import type { GradeEstimate } from "@/types";
import {
  BGS_TIERS,
  PSA_TIERS,
  type GradingService,
  type GradingTierKey,
} from "@/lib/grading/preSubmissionRules";

type RiskRating = "LOW" | "MEDIUM" | "HIGH" | "DO_NOT_GRADE";
type Verdict = "SUBMIT" | "BORDERLINE" | "HOLD_RAW";

interface AnalysisResponse {
  recommendation: { service: GradingService; reason: string };
  selected: { gradingService: GradingService; tier: GradingTierKey; gradingFee: number };
  prices: Record<string, number>;
  raw: { price: number; count: number; latestDate: string | null };
  comps: Record<string, { count: number; latestDate: string | null; source: string }>;
  profits: {
    psa: Array<{ grade: string; net: number }>;
    bgs: Array<{ grade: string; net: number }>;
  };
  breakEven: string;
  riskRating: RiskRating;
  verdict: Verdict;
  verdictReasoning: string;
  links: { psa10Url: string; psa9Url: string; rawUrl: string };
  fallbackNotice: string | null;
}

interface Props {
  estimate: GradeEstimate;
  cardIdentity?: {
    player_name?: string;
    year?: string;
    set_name?: string;
    parallel_type?: string;
    card_number?: string;
    variation?: string;
    insert?: string;
  } | null;
}

const STORAGE_KEYS = {
  service: "preSubmission.selectedService",
  tier: "preSubmission.selectedTier",
  borderline: "preSubmission.borderlineToggle",
};

function formatMoney(value: number): string {
  return `$${value.toFixed(2)}`;
}

function formatSignedMoney(value: number): string {
  const sign = value >= 0 ? "+" : "-";
  return `${sign}$${Math.abs(value).toFixed(2)}`;
}

export default function PreSubmissionAnalysisSection({ estimate, cardIdentity }: Props) {
  const [isOpen, setIsOpen] = useState(true);
  const [service, setService] = useState<GradingService>("psa");
  const [tier, setTier] = useState<GradingTierKey>("value");
  const [rawCost, setRawCost] = useState<number>(0);
  const [showBgsComparison, setShowBgsComparison] = useState(false);
  const [isBusinessMode, setIsBusinessMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const storedService = sessionStorage.getItem(STORAGE_KEYS.service);
    const storedTier = sessionStorage.getItem(STORAGE_KEYS.tier);
    const storedBorderline = sessionStorage.getItem(STORAGE_KEYS.borderline);
    if (storedService === "psa" || storedService === "bgs") setService(storedService);
    if (storedTier) setTier(storedTier as GradingTierKey);
    if (storedBorderline) setShowBgsComparison(storedBorderline === "true");
  }, []);

  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEYS.service, service);
    sessionStorage.setItem(STORAGE_KEYS.tier, tier);
    sessionStorage.setItem(STORAGE_KEYS.borderline, String(showBgsComparison));
  }, [service, tier, showBgsComparison]);

  useEffect(() => {
    let cancelled = false;
    const loadMode = async () => {
      try {
        const res = await fetch("/api/grading/credits");
        const payload = await res.json().catch(() => null);
        if (cancelled) return;
        const business = payload?.tier === "business";
        setIsBusinessMode(business);
        if (business) setTier("value");
      } catch {
        if (!cancelled) setIsBusinessMode(false);
      }
    };
    void loadMode();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const lookupRawCost = async () => {
      if (!cardIdentity?.player_name && !cardIdentity?.set_name) return;
      try {
        const res = await fetch("/api/grading/raw-cost-lookup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ card: cardIdentity }),
        });
        if (!res.ok) return;
        const payload = await res.json();
        if (cancelled) return;
        if (typeof payload?.rawCost === "number" && payload.rawCost >= 0) {
          setRawCost(payload.rawCost);
        }
      } catch {
        // best-effort only
      }
    };
    void lookupRawCost();
    return () => {
      cancelled = true;
    };
  }, [cardIdentity]);

  useEffect(() => {
    let cancelled = false;
    const runAnalysis = async () => {
      if (!cardIdentity?.player_name) return;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/grading/pre-submission-analysis", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            card: cardIdentity,
            rawCost,
            gradingService: service,
            serviceTier: tier,
            showBgsComparison,
            estimate,
          }),
        });
        if (!res.ok) throw new Error("Analysis request failed");
        const payload = (await res.json()) as AnalysisResponse;
        if (!cancelled) setAnalysis(payload);
      } catch {
        if (!cancelled) setError("Unable to run pre-submission analysis right now.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void runAnalysis();
    return () => {
      cancelled = true;
    };
  }, [cardIdentity, rawCost, service, tier, showBgsComparison, estimate]);

  const tierOptions = useMemo(() => {
    if (service === "bgs") {
      return [{ value: "standard", label: `BGS ${BGS_TIERS.standard.label} ($17.00)` }];
    }
    const options = [
      { value: "value", label: `PSA ${PSA_TIERS.value.label} ($32.99)` },
      { value: "value_plus", label: `PSA ${PSA_TIERS.value_plus.label} ($49.99)` },
      { value: "regular", label: `PSA ${PSA_TIERS.regular.label} ($79.99)` },
    ];
    if (!isBusinessMode) {
      options.push({ value: "bulk", label: "PSA Bulk ($25.00 - membership + 20+ cards)" });
    }
    return options;
  }, [service, isBusinessMode]);

  useEffect(() => {
    if (service === "bgs" && tier !== "standard") setTier("standard");
    if (service === "psa" && tier === "standard") setTier("value");
  }, [service, tier]);

  const verdictStyles =
    analysis?.verdict === "SUBMIT"
      ? "border-emerald-400/40 bg-emerald-500/20 text-emerald-200"
      : analysis?.verdict === "BORDERLINE"
      ? "border-amber-400/40 bg-amber-500/20 text-amber-200"
      : "border-rose-400/40 bg-rose-500/20 text-rose-200";

  return (
    <div className="mt-4 rounded-xl border border-white/[0.08] bg-[#0d1b2a]">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-300">
          Pre-Submission Analysis
        </span>
        <span className="text-sm text-white/60">{isOpen ? "▴" : "▾"}</span>
      </button>

      {isOpen && (
        <div className="space-y-4 border-t border-white/[0.08] px-4 pb-4 pt-3">
          <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/50">
              Grading Service Recommendation
            </p>
            <p className="mt-2 text-sm font-semibold text-white/90">
              Recommended: {analysis?.recommendation.service.toUpperCase() ?? "PSA"}
            </p>
            <p className="mt-1 text-xs text-white/60">
              {analysis?.recommendation.reason ?? "Analyzing card profile and market spread."}
            </p>
            <label className="mt-3 flex items-center gap-2 text-xs text-white/70">
              <input
                type="checkbox"
                checked={showBgsComparison}
                onChange={(e) => setShowBgsComparison(e.target.checked)}
                className="h-4 w-4 rounded border-white/30 bg-transparent"
              />
              I think this card is borderline - show me BGS comparison
            </label>
            {showBgsComparison && analysis ? (
              <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                <div className="rounded-md border border-blue-400/30 bg-blue-500/10 p-2">
                  <p className="text-[11px] font-semibold text-blue-200">PSA Path</p>
                  <p className="mt-1 text-xs text-blue-100">
                    PSA 10 {formatSignedMoney(analysis.profits.psa[0]?.net ?? 0)}
                  </p>
                  <p className="text-xs text-blue-100">
                    PSA 9 {formatSignedMoney(analysis.profits.psa[1]?.net ?? 0)}
                  </p>
                </div>
                <div className="rounded-md border border-emerald-400/30 bg-emerald-500/10 p-2">
                  <p className="text-[11px] font-semibold text-emerald-200">BGS Path</p>
                  <p className="mt-1 text-xs text-emerald-100">
                    BGS 9.5 {formatSignedMoney(analysis.profits.bgs[0]?.net ?? 0)}
                  </p>
                  <p className="text-xs text-emerald-100">
                    BGS 9 {formatSignedMoney(analysis.profits.bgs[1]?.net ?? 0)}
                  </p>
                </div>
              </div>
            ) : null}
          </div>

          <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/50">
              ROI Calculator
            </p>
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
              <label className="text-xs text-white/70">
                Raw cost paid
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={rawCost}
                  onChange={(e) => setRawCost(Number(e.target.value) || 0)}
                  className="mt-1 w-full rounded-md border border-white/15 bg-black/20 px-2 py-1.5 text-sm text-white"
                />
              </label>
              <label className="text-xs text-white/70">
                Grading service
                <select
                  value={service}
                  onChange={(e) => setService(e.target.value as GradingService)}
                  className="mt-1 w-full rounded-md border border-white/15 bg-black/20 px-2 py-1.5 text-sm text-white"
                >
                  <option value="psa">PSA</option>
                  <option value="bgs">BGS</option>
                </select>
              </label>
              <label className="text-xs text-white/70">
                Service tier
                <select
                  value={tier}
                  onChange={(e) => setTier(e.target.value as GradingTierKey)}
                  className="mt-1 w-full rounded-md border border-white/15 bg-black/20 px-2 py-1.5 text-sm text-white"
                >
                  {tierOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {loading ? (
              <p className="mt-3 text-xs text-white/55">Loading comps and ROI scenarios...</p>
            ) : error ? (
              <p className="mt-3 text-xs text-rose-300">{error}</p>
            ) : analysis ? (
              <>
                <div className="mt-3 space-y-2">
                  {[
                    { grade: "PSA 10", net: analysis.profits.psa[0]?.net, price: analysis.prices["PSA 10"] },
                    { grade: "PSA 9", net: analysis.profits.psa[1]?.net, price: analysis.prices["PSA 9"] },
                    { grade: "PSA 8", net: analysis.profits.psa[2]?.net, price: analysis.prices["PSA 8"] },
                  ].map((row) => (
                    <div
                      key={row.grade}
                      className="flex items-center justify-between rounded-md border border-white/[0.08] bg-black/10 px-2.5 py-2"
                    >
                      <div>
                        <p className="text-xs font-semibold text-white/90">
                          {row.grade} est {formatMoney(row.price ?? 0)}
                        </p>
                        <p className="text-[11px] text-white/50">
                          {analysis.comps[row.grade]?.source} - based on {analysis.comps[row.grade]?.count ?? 0} recent eBay sales
                        </p>
                      </div>
                      <p className={`text-sm font-semibold ${(row.net ?? 0) >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                        {formatSignedMoney(row.net ?? 0)}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-full border border-white/20 bg-white/10 px-2 py-1 text-white/80">
                    Break-even: {analysis.breakEven}
                  </span>
                  <span className="rounded-full border border-white/20 bg-white/10 px-2 py-1 text-white/80">
                    Risk: {analysis.riskRating}
                  </span>
                </div>
                {analysis.fallbackNotice ? (
                  <p className="mt-2 text-xs text-amber-200">{analysis.fallbackNotice}</p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  <a
                    href={analysis.links.psa10Url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded border border-blue-700/40 bg-blue-950/40 px-2 py-1 text-[11px] text-blue-200"
                  >
                    PSA 10 sold
                  </a>
                  <a
                    href={analysis.links.psa9Url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded border border-blue-700/40 bg-blue-950/40 px-2 py-1 text-[11px] text-blue-200"
                  >
                    PSA 9 sold
                  </a>
                  <a
                    href={analysis.links.rawUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded border border-white/20 bg-white/10 px-2 py-1 text-[11px] text-white/75"
                  >
                    Raw sold
                  </a>
                </div>
              </>
            ) : null}
          </div>

          <div className={`rounded-lg border p-3 ${verdictStyles}`}>
            <p className="text-sm font-bold tracking-wide">
              {analysis?.verdict === "SUBMIT"
                ? "SUBMIT"
                : analysis?.verdict === "BORDERLINE"
                ? "BORDERLINE"
                : "HOLD RAW"}
            </p>
            <p className="mt-1 text-xs">{analysis?.verdictReasoning ?? "Calculating submission verdict..."}</p>
          </div>
        </div>
      )}
    </div>
  );
}
