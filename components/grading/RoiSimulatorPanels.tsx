"use client";

import type { ProbabilityModel } from "@/lib/grading/roiProjection";
import { SELLING_FEE_RATE } from "@/lib/grading/roiProjection";

// ── Shared dark-theme tokens (match scan page #090B0D shell) ───────────────
const BORDER = "#24282D";
const SURFACE = "#0F1317";
const TEXT = "#E6E8EB";
const MUTED = "#77808C";
const DIM = "#B8C0CC";
const GREEN = "#20B26B";
const AMBER = "#E0A33E";
const RED = "#E5484D";

function money(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  const sign = value < 0 ? "-" : "";
  return `${sign}$${Math.abs(Math.round(value)).toLocaleString("en-US")}`;
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function confidenceMeta(c: "high" | "medium" | "low") {
  if (c === "high") return { color: GREEN, score: 0.9 };
  if (c === "medium") return { color: AMBER, score: 0.68 };
  return { color: RED, score: 0.42 };
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: MUTED, margin: 0 }}>
      {children}
    </p>
  );
}

function StatRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0" }}>
      <span style={{ fontSize: 12, color: MUTED }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: color ?? DIM, fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </div>
  );
}

// ── Projection — estimated grade, confidence, projected profit ─────────────
export function SimpleProjectionPanel({
  company,
  gradeLabel,
  confidence,
  projectedValue,
  psa10Value,
  psa9Value,
  probability,
  cardCost,
  gradingCost,
}: {
  company: string;
  gradeLabel: string;
  confidence: "high" | "medium" | "low";
  projectedValue: number;
  psa10Value: number | null;
  psa9Value: number | null;
  probability: ProbabilityModel;
  cardCost: number;
  gradingCost: number;
}) {
  const conf = confidenceMeta(confidence);
  const sellingFees = projectedValue * SELLING_FEE_RATE;
  const totalOutlay = cardCost + gradingCost;
  const netProfit = projectedValue - sellingFees - cardCost - gradingCost;
  const netColor = netProfit > 0 ? GREEN : netProfit < 0 ? RED : DIM;
  const roi = totalOutlay > 0 ? netProfit / totalOutlay : 0;

  const bands = [
    { label: `${company} 10`, value: probability.psa10, color: GREEN },
    { label: `${company} 9`, value: probability.psa9, color: "#3B82F6" },
    { label: `${company} 8 or lower`, value: probability.psa8OrLower, color: MUTED },
  ];

  return (
    <div style={{ border: `1px solid ${BORDER}`, borderTop: `3px solid ${netColor}`, background: SURFACE, borderRadius: 4, overflow: "hidden" }}>
      {/* Estimated grade + confidence */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, background: BORDER }}>
        <div style={{ background: SURFACE, padding: "14px 18px" }}>
          <Label>AI estimated grade</Label>
          <p style={{ fontSize: 22, fontWeight: 700, color: TEXT, margin: "6px 0 0" }}>{gradeLabel}</p>
        </div>
        <div style={{ background: SURFACE, padding: "14px 18px" }}>
          <Label>Confidence</Label>
          <p style={{ fontSize: 22, fontWeight: 700, color: conf.color, margin: "6px 0 0" }}>{pct(conf.score)}</p>
        </div>
      </div>

      {/* Estimated profit */}
      <div style={{ padding: "16px 18px", borderTop: `1px solid ${BORDER}` }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <Label>Estimated profit</Label>
          <span style={{ fontSize: 11, color: MUTED }}>{Math.round(roi * 100)}% ROI</span>
        </div>
        <p style={{ fontSize: 30, fontWeight: 700, color: netColor, margin: "4px 0 0", fontVariantNumeric: "tabular-nums" }}>
          {money(netProfit)}
        </p>
      </div>

      {/* Breakdown */}
      <div style={{ padding: "4px 18px 14px" }}>
        <StatRow label={`Projected resale value (${company})`} value={money(projectedValue)} color={GREEN} />
        <StatRow label="Your card cost" value={`-${money(cardCost)}`} />
        <StatRow label="Grading cost (this card)" value={`-${money(gradingCost)}`} />
        <StatRow label="Est. selling fees (~13%)" value={`-${money(sellingFees)}`} />
        {(psa10Value !== null || psa9Value !== null) && (
          <>
            <div style={{ height: 1, background: BORDER, margin: "4px 0" }} />
            <StatRow label={`Comp value at ${company} 10`} value={money(psa10Value)} />
            <StatRow label={`Comp value at ${company} 9`} value={money(psa9Value)} />
          </>
        )}
      </div>

      {/* Grade probability */}
      <div style={{ padding: "0 18px 16px" }}>
        <div style={{ display: "flex", height: 8, borderRadius: 3, overflow: "hidden", marginBottom: 10 }}>
          {bands.map((b) => (
            <div key={b.label} style={{ width: `${Math.max(b.value * 100, 0)}%`, background: b.color }} title={`${b.label}: ${pct(b.value)}`} />
          ))}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {bands.map((b) => (
            <div key={b.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11, color: DIM }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: b.color }} />
                {b.label}
              </span>
              <span style={{ fontSize: 11, fontWeight: 600, color: TEXT, fontVariantNumeric: "tabular-nums" }}>{pct(b.value)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
