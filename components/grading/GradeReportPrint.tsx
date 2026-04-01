/**
 * GradeReportPrint — print-friendly, white-background grade report layout.
 *
 * Used in two contexts:
 *   1. Hidden off-screen container in GradeProbabilityPanel for hi-res PNG capture.
 *   2. The /grade-report/print page for browser print → PDF.
 *
 * Uses exclusively inline styles so it renders correctly in html2canvas and
 * in a browser print dialog window where CSS modules / Tailwind may differ.
 */

import type { GradeEstimate } from "@/types";
import { DigitalSlab } from "./DigitalSlab";
import {
  distributionFromRange,
  normalizeDistribution,
  normalizePsaDistribution,
  type GradeOutcome,
} from "@/lib/grading/gradeProbability";
import { buildGradeVerdict, VERDICT_DISCLAIMER } from "@/lib/grading/verdict";

// ── Types ──────────────────────────────────────────────────────────────────

export interface GradeReportPrintProps {
  estimate: GradeEstimate;
  cardIdentity?: {
    player_name?: string;
    year?: string;
    set_name?: string;
    parallel_type?: string;
  } | null;
  primaryImageUrl?: string | null;
  imageUrls?: string[] | null;
  generatedAt?: string;
  slabId?: string;
}

// ── Helpers (mirrored from GradeProbabilityPanel) ──────────────────────────

const PSA_ORDER = ["PSA 10", "PSA 9", "PSA 8", "PSA 7 or lower"];

function formatPercent(probability: number): string {
  return `${Math.round(probability * 100)}%`;
}

function formatGradeNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function buildRangeLabel(estimate: GradeEstimate): string | null {
  const low = estimate.estimated_grade_low;
  const high = estimate.estimated_grade_high;
  if (!Number.isFinite(low) || !Number.isFinite(high)) return null;
  if (low === high) return `PSA ${formatGradeNumber(low)}`;
  return `PSA ${formatGradeNumber(low)}-${formatGradeNumber(high)}`;
}

function mapToPsaBuckets(outcomes: GradeOutcome[]): GradeOutcome[] {
  const map = new Map(PSA_ORDER.map((label) => [label, 0]));
  outcomes.forEach((outcome) => {
    const normalized = outcome.label.toUpperCase();
    let bucket = "PSA 7 or lower";
    if (normalized.includes("10")) bucket = "PSA 10";
    else if (normalized.includes("9")) bucket = "PSA 9";
    else if (normalized.includes("8")) bucket = "PSA 8";
    map.set(bucket, (map.get(bucket) ?? 0) + outcome.probability);
  });
  return PSA_ORDER.map((label) => ({ label, probability: map.get(label) ?? 0 }));
}

function getPsaOutcomes(estimate: GradeEstimate): GradeOutcome[] {
  const allowPsa10Override =
    estimate.grade_probabilities?.confidence === "high";

  if (estimate.grade_probabilities?.psa) {
    return normalizePsaDistribution(
      [
        { label: "PSA 10", probability: estimate.grade_probabilities.psa["10"] },
        { label: "PSA 9", probability: estimate.grade_probabilities.psa["9"] },
        { label: "PSA 8", probability: estimate.grade_probabilities.psa["8"] },
        {
          label: "PSA 7 or lower",
          probability: estimate.grade_probabilities.psa["7_or_lower"],
        },
      ],
      { allowPsa10Override }
    );
  }
  const rangeLabel = buildRangeLabel(estimate);
  const derived = rangeLabel
    ? distributionFromRange(rangeLabel, estimate.grade_probabilities?.confidence)
    : [];
  return normalizePsaDistribution(mapToPsaBuckets(derived), { allowPsa10Override });
}

function getBgsOutcomes(estimate: GradeEstimate): GradeOutcome[] | null {
  if (!estimate.grade_probabilities?.bgs) return null;
  return normalizeDistribution([
    { label: "BGS 9.5", probability: estimate.grade_probabilities.bgs["9.5"] },
    { label: "BGS 9", probability: estimate.grade_probabilities.bgs["9"] },
    { label: "BGS 8.5", probability: estimate.grade_probabilities.bgs["8.5"] },
    {
      label: "BGS 8 or lower",
      probability: estimate.grade_probabilities.bgs["8_or_lower"],
    },
  ]);
}

function expectedValue(outcomes: GradeOutcome[]): number {
  const gradeMap: Record<string, number> = {
    "PSA 10": 10,
    "PSA 9": 9,
    "PSA 8": 8,
    "PSA 7 or lower": 7,
  };
  return outcomes.reduce(
    (sum, outcome) => sum + (gradeMap[outcome.label] ?? 0) * outcome.probability,
    0
  );
}

function mostLikely(outcomes: GradeOutcome[]): GradeOutcome | null {
  if (!outcomes.length) return null;
  return outcomes.reduce((max, o) => (o.probability > max.probability ? o : max));
}

function buildCardLabel(cardIdentity?: GradeReportPrintProps["cardIdentity"]): string | null {
  if (!cardIdentity) return null;
  const parts: string[] = [];
  if (cardIdentity.player_name) parts.push(cardIdentity.player_name);
  if (cardIdentity.year) parts.push(cardIdentity.year);
  if (cardIdentity.set_name) {
    let setLabel = cardIdentity.set_name;
    if (cardIdentity.parallel_type) setLabel = `${setLabel} (${cardIdentity.parallel_type})`;
    parts.push(setLabel);
  } else if (cardIdentity.parallel_type) {
    parts.push(cardIdentity.parallel_type);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

// ── Sub-components (inline-styled for print safety) ───────────────────────

const FONT = "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const COLOR = {
  text: "#0F172A",
  secondary: "#475569",
  muted: "#94A3B8",
  border: "#E5E7EB",
  surfaceSoft: "#F8FAFC",
  accent: "#2563EB",
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        color: COLOR.muted,
        marginBottom: 10,
        fontFamily: FONT,
      }}
    >
      {children}
    </div>
  );
}

function ProbBar({
  label,
  probability,
  highlighted,
}: {
  label: string;
  probability: number;
  highlighted: boolean;
}) {
  const pct = Math.round(probability * 100);
  return (
    <div style={{ marginBottom: 10, opacity: pct === 0 ? 0.4 : 1 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 4,
          fontFamily: FONT,
        }}
      >
        <span
          style={{
            fontSize: 11,
            color: highlighted ? COLOR.text : COLOR.secondary,
            fontWeight: highlighted ? 600 : 400,
          }}
        >
          {label}
        </span>
        <span
          style={{
            fontSize: 11,
            fontFamily: "monospace",
            color: highlighted ? COLOR.text : COLOR.muted,
            fontWeight: highlighted ? 600 : 400,
          }}
        >
          {pct}%
        </span>
      </div>
      <div
        style={{
          height: 6,
          borderRadius: 4,
          backgroundColor: "#E5E7EB",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            borderRadius: 4,
            width: `${pct}%`,
            backgroundColor: highlighted ? "#2563EB" : "#BFDBFE",
          }}
        />
      </div>
    </div>
  );
}

function EvidenceCard({ label, text }: { label: string; text?: string }) {
  return (
    <div
      style={{
        border: `1px solid ${COLOR.border}`,
        borderRadius: 8,
        padding: "10px 12px",
        backgroundColor: COLOR.surfaceSoft,
        fontFamily: FONT,
      }}
    >
      <div
        style={{
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: "0.10em",
          textTransform: "uppercase",
          color: COLOR.muted,
          marginBottom: 5,
        }}
      >
        {label}
      </div>
      <p
        style={{
          fontSize: 10.5,
          color: COLOR.secondary,
          lineHeight: 1.55,
          margin: 0,
        }}
      >
        {text || <span style={{ color: COLOR.muted, fontStyle: "italic" }}>No data</span>}
      </p>
    </div>
  );
}

function VerdictField({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        border: `1px solid ${COLOR.border}`,
        borderRadius: 8,
        padding: "10px 12px",
        backgroundColor: "#FFFFFF",
        fontFamily: FONT,
      }}
    >
      <div
        style={{
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: "0.10em",
          textTransform: "uppercase",
          color: COLOR.muted,
          marginBottom: 5,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, color: COLOR.text }}>{value}</div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export function GradeReportPrint({
  estimate,
  cardIdentity,
  primaryImageUrl,
  imageUrls,
  generatedAt,
  slabId,
}: GradeReportPrintProps) {
  const psaOutcomes = getPsaOutcomes(estimate);
  const bgsOutcomes = getBgsOutcomes(estimate);
  const psaTotal = psaOutcomes.reduce((sum, o) => sum + o.probability, 0);
  const likely = mostLikely(psaOutcomes);
  const ev = expectedValue(psaOutcomes);
  const evLabel = psaTotal > 0 ? ev.toFixed(1) : "—";
  const confidence = estimate.grade_probabilities?.confidence ?? null;
  const cardLabel = buildCardLabel(cardIdentity);
  const verdict = buildGradeVerdict(estimate, cardIdentity);

  const imageUrl =
    (imageUrls?.filter(Boolean) ?? []).length > 0
      ? imageUrls!.filter(Boolean)[0]
      : primaryImageUrl ?? null;

  const dateStr = generatedAt
    ? new Date(generatedAt).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : new Date().toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });

  const CONF_COLOR: Record<string, string> = {
    high: "#059669",
    medium: "#2563EB",
    low: "#D97706",
  };
  const CONF_BG: Record<string, string> = {
    high: "#ECFDF5",
    medium: "#EFF6FF",
    low: "#FFFBEB",
  };
  const VERDICT_COLOR: Record<string, string> = {
    Grade: "#059669",
    Borderline: "#D97706",
    "Sell Raw": "#475569",
    "Rescan Needed": "#DC2626",
  };
  const VERDICT_BG: Record<string, string> = {
    Grade: "#ECFDF5",
    Borderline: "#FFFBEB",
    "Sell Raw": "#F1F5F9",
    "Rescan Needed": "#FEF2F2",
  };

  return (
    <div
      style={{
        width: 794,
        backgroundColor: "#FFFFFF",
        fontFamily: FONT,
        color: COLOR.text,
        padding: "40px 40px 32px",
        boxSizing: "border-box",
      }}
    >
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          paddingBottom: 18,
          borderBottom: `1.5px solid ${COLOR.border}`,
          marginBottom: 24,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: COLOR.muted,
              marginBottom: 4,
            }}
          >
            CardzCheck
          </div>
          <div
            style={{
              fontSize: 20,
              fontWeight: 800,
              color: COLOR.text,
              letterSpacing: "-0.02em",
              lineHeight: 1.1,
            }}
          >
            Grade Probability Report
          </div>
          {cardLabel ? (
            <div
              style={{
                marginTop: 5,
                fontSize: 12,
                color: COLOR.secondary,
                fontWeight: 500,
              }}
            >
              {cardLabel}
            </div>
          ) : null}
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 10, color: COLOR.muted }}>{dateStr}</div>
          {confidence ? (
            <div
              style={{
                display: "inline-block",
                marginTop: 6,
                padding: "3px 10px",
                borderRadius: 20,
                backgroundColor: CONF_BG[confidence] ?? "#F9FAFB",
                border: `1px solid ${(CONF_COLOR[confidence] ?? "#6B7280") + "33"}`,
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: CONF_COLOR[confidence] ?? "#6B7280",
              }}
            >
              {confidence} confidence
            </div>
          ) : null}
        </div>
      </div>

      {/* ── Top section: slab + primary result ──────────────────────── */}
      <div
        style={{
          display: "flex",
          gap: 28,
          alignItems: "flex-start",
          marginBottom: 24,
          paddingBottom: 24,
          borderBottom: `1px solid ${COLOR.border}`,
        }}
      >
        {/* Left: digital slab */}
        <div style={{ flexShrink: 0 }}>
          <DigitalSlab
            imageUrl={imageUrl}
            mostLikelyLabel={likely?.label ?? null}
            mostLikelyPct={likely?.probability ?? null}
            expectedGrade={psaTotal > 0 ? evLabel : null}
            confidence={confidence}
            slabId={slabId ?? String(Date.now())}
            cardLabel={cardLabel}
          />
        </div>

        {/* Right: key metrics */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <SectionLabel>Most Likely Outcome</SectionLabel>

          {psaTotal > 0 && likely ? (
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 10,
                marginBottom: 16,
              }}
            >
              <span
                style={{
                  fontSize: 40,
                  fontWeight: 800,
                  color: COLOR.text,
                  letterSpacing: "-0.03em",
                  lineHeight: 1,
                }}
              >
                {likely.label}
              </span>
              <span
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                  color: COLOR.accent,
                }}
              >
                {formatPercent(likely.probability)}
              </span>
            </div>
          ) : (
            <span
              style={{
                fontSize: 40,
                fontWeight: 800,
                color: COLOR.muted,
              }}
            >
              —
            </span>
          )}

          {/* Stats grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 12,
              marginTop: 4,
            }}
          >
            <div
              style={{
                border: `1px solid ${COLOR.border}`,
                borderRadius: 8,
                padding: "10px 14px",
                backgroundColor: COLOR.surfaceSoft,
              }}
            >
              <div
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: "0.10em",
                  textTransform: "uppercase",
                  color: COLOR.muted,
                  marginBottom: 4,
                }}
              >
                Expected Grade (EV)
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: COLOR.text }}>
                {evLabel}
              </div>
            </div>

            <div
              style={{
                border: `1px solid ${COLOR.border}`,
                borderRadius: 8,
                padding: "10px 14px",
                backgroundColor: COLOR.surfaceSoft,
              }}
            >
              <div
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: "0.10em",
                  textTransform: "uppercase",
                  color: COLOR.muted,
                  marginBottom: 4,
                }}
              >
                Confidence
              </div>
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  color: confidence ? (CONF_COLOR[confidence] ?? COLOR.text) : COLOR.muted,
                  textTransform: "capitalize",
                }}
              >
                {confidence ?? "—"}
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* ── Verdict ─────────────────────────────────────────────────── */}
      <div
        style={{
          marginBottom: 24,
          paddingBottom: 24,
          borderBottom: `1px solid ${COLOR.border}`,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 10,
            gap: 10,
          }}
        >
          <SectionLabel>THE VERDICT</SectionLabel>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              borderRadius: 999,
              padding: "3px 10px",
              fontSize: 9,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              border: `1px solid ${(VERDICT_COLOR[verdict.recommendation] ?? COLOR.secondary) + "44"}`,
              color: VERDICT_COLOR[verdict.recommendation] ?? COLOR.secondary,
              backgroundColor: VERDICT_BG[verdict.recommendation] ?? COLOR.surfaceSoft,
            }}
          >
            {verdict.recommendation}
          </span>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 10,
            marginBottom: 10,
          }}
        >
          <VerdictField label="Recommendation" value={verdict.recommendation} />
          <VerdictField label="Suggested Grader" value={verdict.suggestedGrader} />
          <VerdictField label="Expected Outcome" value={verdict.expectedOutcome} />
          <VerdictField label="Strategy Tip" value={verdict.strategyTip} />
        </div>

        <div
          style={{
            border: `1px solid ${COLOR.border}`,
            borderRadius: 8,
            padding: "10px 12px",
            backgroundColor: "#FFFFFF",
          }}
        >
          <div
            style={{
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: "0.10em",
              textTransform: "uppercase",
              color: COLOR.muted,
              marginBottom: 5,
            }}
          >
            Reasoning
          </div>
          <p
            style={{
              margin: 0,
              fontSize: 10.5,
              lineHeight: 1.55,
              color: COLOR.secondary,
            }}
          >
            {verdict.reasoning}
          </p>
        </div>

        <p
          style={{
            marginTop: 10,
            marginBottom: 0,
            whiteSpace: "pre-line",
            fontSize: 9.5,
            lineHeight: 1.5,
            color: COLOR.muted,
          }}
        >
          {VERDICT_DISCLAIMER}
        </p>
      </div>

      {/* ── PSA distribution ────────────────────────────────────────── */}
      <div
        style={{
          marginBottom: 24,
          paddingBottom: 24,
          borderBottom: `1px solid ${COLOR.border}`,
        }}
      >
        <SectionLabel>PSA Probability Distribution</SectionLabel>
        {psaOutcomes.map((outcome) => (
          <ProbBar
            key={outcome.label}
            label={outcome.label}
            probability={outcome.probability}
            highlighted={outcome.label === likely?.label}
          />
        ))}
      </div>

      {/* ── BGS distribution (if available) ─────────────────────────── */}
      {bgsOutcomes ? (
        <div
          style={{
            marginBottom: 24,
            paddingBottom: 24,
            borderBottom: `1px solid ${COLOR.border}`,
          }}
        >
          <SectionLabel>BGS Probability Distribution</SectionLabel>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "4px 24px",
            }}
          >
            {bgsOutcomes.map((outcome) => (
              <ProbBar
                key={outcome.label}
                label={outcome.label}
                probability={outcome.probability}
                highlighted={false}
              />
            ))}
          </div>
        </div>
      ) : null}

      {/* ── Evidence blocks ──────────────────────────────────────────── */}
      <div
        style={{
          marginBottom: 24,
          paddingBottom: 24,
          borderBottom: `1px solid ${COLOR.border}`,
        }}
      >
        <SectionLabel>Evidence (from photos)</SectionLabel>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 10,
          }}
        >
          <EvidenceCard label="Centering" text={estimate.centering} />
          <EvidenceCard label="Corners" text={estimate.corners} />
          <EvidenceCard label="Surface" text={estimate.surface} />
          <EvidenceCard label="Edges" text={estimate.edges} />
        </div>

        {estimate.grade_notes ? (
          <div
            style={{
              marginTop: 12,
              border: `1px solid ${COLOR.border}`,
              borderRadius: 8,
              padding: "10px 14px",
              backgroundColor: COLOR.surfaceSoft,
              fontFamily: FONT,
            }}
          >
            <span
              style={{
                fontSize: 10.5,
                fontWeight: 600,
                color: COLOR.text,
              }}
            >
              Notes:{" "}
            </span>
            <span style={{ fontSize: 10.5, color: COLOR.secondary, lineHeight: 1.55 }}>
              {estimate.grade_notes}
            </span>
          </div>
        ) : null}
      </div>

      {/* ── Footer ──────────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
        }}
      >
        <p
          style={{
            fontSize: 9,
            color: COLOR.muted,
            lineHeight: 1.5,
            margin: 0,
            maxWidth: 460,
            fontFamily: FONT,
          }}
        >
          AI estimate only. Not a professional grade. CardzCheck is not affiliated with PSA,
          BGS, or SGC. Results may vary and should not be used as the sole basis for financial
          decisions.
        </p>
        <span
          style={{
            fontSize: 9,
            color: "#D1D5DB",
            fontFamily: "monospace",
            letterSpacing: "0.04em",
          }}
        >
          cardzcheck.com
        </span>
      </div>
    </div>
  );
}
