"use client";

import { useMemo, useState } from "react";
import type { GradeOutcome } from "@/lib/grading/gradeProbability";
import type { VerdictCardIdentity } from "@/lib/grading/verdict";
import type { WorthGradingResult } from "@/types";
import { SELLING_FEE_RATE } from "@/lib/grading/roiProjection";
import {
  buildMarketplaceLinks,
  MARKETPLACE_TYPE_LABELS,
  type CardSearchParams,
  type MarketplaceLink,
} from "@/lib/comps/marketplace-urls";

// ─────────────────────────────────────────────────────────
// Per-grade comps + live value entry.
//
// For each PSA bucket the user gets sold-comp links across every marketplace
// (pre-filtered to that grade) and an input to type the value they find. Entered
// values drive a live probability-weighted expected value (EV) and an optional
// ROI projection. All state is local — nothing is persisted.
// ─────────────────────────────────────────────────────────

interface GradeCompsValuePanelProps {
  cardIdentity: VerdictCardIdentity;
  /** PSA 10 / PSA 9 / PSA 8 / PSA 7 or lower with probabilities (sums ~1). */
  psaOutcomes: GradeOutcome[];
  /** Optional priced comps from the scan, used to prefill the value inputs. */
  postGradingValue?: WorthGradingResult | null;
  flat?: boolean;
}

type BucketKey = "psa10" | "psa9" | "psa8" | "psa7lower";

interface Bucket {
  key: BucketKey;
  label: string;
  probability: number;
  /**
   * Numeric grade used for comp searches (collapses "7 or lower" → "7").
   * Kept numeric so it composes with gradingCompany="PSA" into "PSA 10"
   * rather than duplicating the company ("PSA PSA 10").
   */
  gradeNumber: string;
}

// Marketplaces shown inline; the rest sit behind the "All marketplaces" toggle.
const PRIMARY_MARKETPLACE_IDS = new Set(["ebay-sold", "130point"]);

function bucketForLabel(outcome: GradeOutcome): Bucket | null {
  const label = outcome.label.toUpperCase();
  if (label.includes("10")) {
    return { key: "psa10", label: "PSA 10", probability: outcome.probability, gradeNumber: "10" };
  }
  if (label.includes("9")) {
    return { key: "psa9", label: "PSA 9", probability: outcome.probability, gradeNumber: "9" };
  }
  if (label.includes("8")) {
    return { key: "psa8", label: "PSA 8", probability: outcome.probability, gradeNumber: "8" };
  }
  return {
    key: "psa7lower",
    label: "PSA 7 or lower",
    probability: outcome.probability,
    gradeNumber: "7",
  };
}

function compsParamsFor(cardIdentity: VerdictCardIdentity, gradeNumber: string): CardSearchParams | null {
  const declared = cardIdentity?.owner_declared_title?.trim();
  if (declared) {
    // The declared title already encodes year/set/parallel — use it as the seed.
    return {
      playerName: declared,
      grade: gradeNumber,
      gradingCompany: "PSA",
    };
  }
  if (!cardIdentity?.player_name?.trim()) return null;
  return {
    playerName: cardIdentity.player_name,
    year: cardIdentity.year,
    setName: cardIdentity.set_name,
    parallelType: cardIdentity.parallel_type ?? cardIdentity.insert,
    grade: gradeNumber,
    gradingCompany: "PSA",
  };
}

function parseMoney(value: string): number {
  const n = Number(value.replace(/[$,\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function formatMoney(value: number): string {
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

function pricePrefill(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? String(Math.round(value))
    : "";
}

function CompChip({ link }: { link: MarketplaceLink }) {
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      title={`${link.name} · ${link.tagline}`}
      className="inline-flex items-center gap-1 rounded border border-white/[0.08] bg-white/[0.04] px-2 py-0.5 text-[10px] font-medium text-white/60 transition-colors hover:border-white/20 hover:bg-white/[0.08] hover:text-white/90"
    >
      <span style={{ color: link.accentColor }}>●</span>
      {link.name}
      <span className="text-[8px] font-semibold uppercase tracking-wide text-white/30">
        {MARKETPLACE_TYPE_LABELS[link.type]}
      </span>
    </a>
  );
}

export default function GradeCompsValuePanel({
  cardIdentity,
  psaOutcomes,
  postGradingValue,
  flat = false,
}: GradeCompsValuePanelProps) {
  const buckets = useMemo(() => {
    const seen = new Set<BucketKey>();
    const out: Bucket[] = [];
    for (const outcome of psaOutcomes) {
      const bucket = bucketForLabel(outcome);
      if (bucket && !seen.has(bucket.key)) {
        seen.add(bucket.key);
        out.push(bucket);
      }
    }
    return out;
  }, [psaOutcomes]);

  const [values, setValues] = useState<Record<BucketKey, string>>(() => ({
    psa10: pricePrefill(postGradingValue?.psa["10"].price),
    psa9: pricePrefill(postGradingValue?.psa["9"].price),
    psa8: pricePrefill(postGradingValue?.psa["8"].price),
    psa7lower: "",
  }));
  const [expanded, setExpanded] = useState<Record<BucketKey, boolean>>({
    psa10: false,
    psa9: false,
    psa8: false,
    psa7lower: false,
  });
  const [roiOpen, setRoiOpen] = useState(false);
  const [cardCost, setCardCost] = useState("");
  const [gradingCost, setGradingCost] = useState("");

  // Live probability-weighted EV over buckets that have a value entered.
  const { ev, enteredCount } = useMemo(() => {
    let weighted = 0;
    let count = 0;
    for (const bucket of buckets) {
      const v = parseMoney(values[bucket.key]);
      if (v > 0) {
        weighted += bucket.probability * v;
        count += 1;
      }
    }
    return { ev: weighted, enteredCount: count };
  }, [buckets, values]);

  const cost = parseMoney(cardCost);
  const grading = parseMoney(gradingCost);
  const sellingFees = ev * SELLING_FEE_RATE;
  const netProfit = ev - sellingFees - cost - grading;
  const totalOutlay = cost + grading;
  const roi = totalOutlay > 0 ? netProfit / totalOutlay : null;

  const hasIdentity = useMemo(
    () => Boolean(compsParamsFor(cardIdentity, "10")),
    [cardIdentity]
  );
  if (!hasIdentity || buckets.length === 0) return null;

  const wrapClass = flat
    ? "mt-6 border-t border-white/[0.07] pt-4"
    : "mt-3 rounded-xl border border-white/[0.07] bg-[#0d1117] p-4";

  return (
    <div className={wrapClass} data-export-ignore="true">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-blue-400/70">
          Comps &amp; value by grade
        </p>
        <p className="text-[10px] text-white/40">
          Enter what you find — EV updates live
        </p>
      </div>

      {/* Per-grade rows */}
      <div className="space-y-2">
        {buckets.map((bucket) => {
          const params = compsParamsFor(cardIdentity, bucket.gradeNumber);
          const links = params ? buildMarketplaceLinks(params) : [];
          const primary = links.filter((l) => PRIMARY_MARKETPLACE_IDS.has(l.id));
          const rest = links.filter((l) => !PRIMARY_MARKETPLACE_IDS.has(l.id));
          const isOpen = expanded[bucket.key];

          return (
            <div
              key={bucket.key}
              className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-2.5"
            >
              <div className="flex flex-wrap items-center gap-2">
                {/* Grade + probability */}
                <div className="flex min-w-[120px] items-center gap-2">
                  <span className="text-xs font-semibold text-white/85">{bucket.label}</span>
                  <span className="rounded-full bg-blue-500/15 px-1.5 py-0.5 font-mono text-[10px] text-blue-300">
                    {Math.round(bucket.probability * 100)}%
                  </span>
                </div>

                {/* Value input */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-white/40">$</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={values[bucket.key]}
                    onChange={(e) =>
                      setValues((prev) => ({ ...prev, [bucket.key]: e.target.value }))
                    }
                    placeholder="value"
                    className="w-20 rounded border border-white/10 bg-black/30 px-2 py-1 text-xs text-white/90 outline-none transition-colors placeholder:text-white/25 focus:border-blue-500/50"
                  />
                </div>

                {/* Primary comp links */}
                <div className="flex flex-1 flex-wrap items-center gap-1.5">
                  {primary.map((link) => (
                    <CompChip key={link.id} link={link} />
                  ))}
                  {rest.length > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        setExpanded((prev) => ({ ...prev, [bucket.key]: !prev[bucket.key] }))
                      }
                      className="inline-flex items-center gap-0.5 rounded border border-white/[0.08] bg-white/[0.02] px-2 py-0.5 text-[10px] font-medium text-white/45 transition-colors hover:text-white/80"
                    >
                      {isOpen ? "Less" : `All ${links.length}`}
                      <svg
                        className={`h-2.5 w-2.5 transition-transform ${isOpen ? "rotate-180" : ""}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>

              {/* Expanded marketplaces */}
              {isOpen && rest.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5 border-t border-white/[0.06] pt-2">
                  {rest.map((link) => (
                    <CompChip key={link.id} link={link} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Live EV + ROI */}
      <div className="mt-3 rounded-lg border border-white/[0.08] bg-white/[0.03] p-3">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-widest text-white/35">
              Weighted projected value
            </p>
            <p className="mt-0.5 text-2xl font-bold tabular-nums text-emerald-300">
              {enteredCount > 0 ? formatMoney(ev) : "—"}
            </p>
          </div>
          <p className="text-[10px] text-white/40">
            {enteredCount > 0
              ? `${enteredCount} of ${buckets.length} grades entered`
              : "Enter grade values to project"}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setRoiOpen((p) => !p)}
          className="mt-2 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-white/40 transition-colors hover:text-white/70"
        >
          {roiOpen ? "Hide ROI" : "Add costs for ROI"}
          <svg
            className={`h-2.5 w-2.5 transition-transform ${roiOpen ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {roiOpen && (
          <div className="mt-2 space-y-2 border-t border-white/[0.06] pt-2">
            <div className="flex flex-wrap gap-3">
              <label className="flex items-center gap-1.5 text-[11px] text-white/50">
                Card cost $
                <input
                  type="text"
                  inputMode="decimal"
                  value={cardCost}
                  onChange={(e) => setCardCost(e.target.value)}
                  placeholder="0"
                  className="w-20 rounded border border-white/10 bg-black/30 px-2 py-1 text-xs text-white/90 outline-none focus:border-blue-500/50"
                />
              </label>
              <label className="flex items-center gap-1.5 text-[11px] text-white/50">
                Grading $
                <input
                  type="text"
                  inputMode="decimal"
                  value={gradingCost}
                  onChange={(e) => setGradingCost(e.target.value)}
                  placeholder="0"
                  className="w-20 rounded border border-white/10 bg-black/30 px-2 py-1 text-xs text-white/90 outline-none focus:border-blue-500/50"
                />
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px]">
              <span className="text-white/45">
                Est. selling fees (~13%):{" "}
                <span className="text-white/70">-{formatMoney(sellingFees)}</span>
              </span>
              <span className="text-white/45">
                Net profit:{" "}
                <span className={netProfit >= 0 ? "font-semibold text-emerald-300" : "font-semibold text-rose-300"}>
                  {netProfit >= 0 ? "" : "-"}
                  {formatMoney(Math.abs(netProfit))}
                </span>
              </span>
              {roi !== null && (
                <span className="text-white/45">
                  ROI: <span className="font-semibold text-white/80">{Math.round(roi * 100)}%</span>
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      <p className="mt-2 text-[10px] leading-snug text-white/35">
        Sold-comp links open the matching grade on each marketplace. Estimates are not guarantees.
      </p>
    </div>
  );
}
