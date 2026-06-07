"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import CardScanSlot, {
  type SlotState,
  type CardScanSlotCompleteResult,
} from "@/components/grading/CardScanSlot";
import { MicButton } from "@/components/ui/MicButton";
import { SimpleProjectionPanel } from "@/components/grading/RoiSimulatorPanels";
import { computeRoiProjection, type RoiProjection } from "@/lib/grading/roiProjection";
import { buildDeclaredScanPrefaceFromTitle } from "@/lib/grading/cardTitleInput";
import { appendSpeechTranscript } from "@/lib/speech";

// ── Dark-theme tokens (match scan page #090B0D shell) ──────────────────────
const BORDER = "#24282D";
const SURFACE = "#0F1317";
const SURFACE_SOFT = "#13171B";
const TEXT = "#E6E8EB";
const MUTED = "#77808C";
const DIM = "#B8C0CC";
const GREEN = "#20B26B";

type GradingCompany = "PSA" | "BGS" | "SGC";
const GRADING_COMPANIES: GradingCompany[] = ["PSA", "BGS", "SGC"];

const TIER_MAX_CARDS: Record<string, number> = { free: 2, pro: 5, business: 10 };

// ── Per-card model ──────────────────────────────────────────────────────────
interface SimulatorCard {
  id: string;
  cardCost: string;
  slotState: SlotState;
  result: CardScanSlotCompleteResult | null;
}

function makeCard(index: number): SimulatorCard {
  return { id: `card-${Date.now()}-${index}`, cardCost: "", slotState: "idle", result: null };
}

function cardLabel(index: number) {
  return `Card ${String(index + 1).padStart(2, "0")}`;
}

function projectionFor(result: CardScanSlotCompleteResult | null): RoiProjection | null {
  if (!result?.postGradingValue) return null;
  const probabilities = result.estimate.grade_probabilities;
  if (!probabilities) return null;
  return computeRoiProjection(result.postGradingValue, probabilities);
}

function toMoney(value: string): number {
  const n = Number(value.replace(/[$,]/g, "").trim());
  return Number.isFinite(n) && n > 0 ? n : 0;
}

// ── Shared input styles ─────────────────────────────────────────────────────
const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "9px 11px",
  fontSize: 13,
  color: TEXT,
  background: SURFACE_SOFT,
  border: `1px solid ${BORDER}`,
  borderRadius: 3,
  outline: "none",
};

// ── Status badge ────────────────────────────────────────────────────────────
function StatusBadge({ state }: { state: SlotState }) {
  const map: Record<SlotState, { text: string; color: string; bg: string; border: string }> = {
    done: { text: "Estimated", color: GREEN, bg: "rgba(32,178,107,0.1)", border: "rgba(32,178,107,0.3)" },
    analyzing: { text: "Analyzing…", color: "#E0A33E", bg: "rgba(224,163,62,0.1)", border: "rgba(224,163,62,0.3)" },
    error: { text: "Error", color: "#E5484D", bg: "rgba(229,72,77,0.1)", border: "rgba(229,72,77,0.3)" },
    ready: { text: "Ready", color: "#3B82F6", bg: "rgba(59,130,246,0.1)", border: "rgba(59,130,246,0.3)" },
    idle: { text: "Awaiting photos", color: MUTED, bg: SURFACE_SOFT, border: BORDER },
  };
  const s = map[state];
  return (
    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: s.color, background: s.bg, border: `1px solid ${s.border}`, borderRadius: 3, padding: "3px 8px" }}>
      {s.text}
    </span>
  );
}

// ── Main component ──────────────────────────────────────────────────────────
interface MockSubmissionFlowProps {
  tier: string;
  tierLoaded: boolean;
}

export default function MockSubmissionFlow({ tier, tierLoaded }: MockSubmissionFlowProps) {
  const router = useRouter();
  const pathname = usePathname();
  const hubPath = pathname?.startsWith("/business") ? "/business/grade-hub" : "/grade-hub";

  const maxCards = TIER_MAX_CARDS[tier] ?? 2;

  // Submission-level setup
  const [company, setCompany] = useState<GradingCompany>("PSA");
  const [goals, setGoals] = useState("");
  const [totalGradingCost, setTotalGradingCost] = useState("");

  const [cards, setCards] = useState<SimulatorCard[]>([makeCard(0)]);

  useEffect(() => {
    if (tierLoaded) setCards((prev) => prev.slice(0, maxCards));
  }, [tierLoaded, maxCards]);

  // ── Mutations ─────────────────────────────────────────────────────────────
  const addCard = useCallback(() => {
    setCards((prev) => (prev.length >= maxCards ? prev : [...prev, makeCard(prev.length)]));
  }, [maxCards]);

  const removeCard = useCallback((id: string) => {
    setCards((prev) => (prev.length <= 1 ? prev : prev.filter((c) => c.id !== id)));
  }, []);

  const updateCard = useCallback((id: string, patch: Partial<SimulatorCard>) => {
    setCards((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }, []);

  const handleSlotStateChange = useCallback(
    (cardId: string, state: SlotState) => updateCard(cardId, { slotState: state }),
    [updateCard]
  );

  const handleComplete = useCallback(
    (cardId: string, result: CardScanSlotCompleteResult) => updateCard(cardId, { result }),
    [updateCard]
  );

  // ── Derived ───────────────────────────────────────────────────────────────
  const anyDone = cards.some((c) => c.slotState === "done");
  const perCardGradingCost = toMoney(totalGradingCost) / Math.max(cards.length, 1);

  if (!tierLoaded) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "80px 0" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 22, height: 22, borderRadius: "50%", border: `2px solid ${GREEN}`, borderTopColor: "transparent", margin: "0 auto 10px", animation: "spin 0.8s linear infinite" }} />
          <p style={{ fontSize: 12, color: MUTED }}>Loading…</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* ── Intro ─────────────────────────────────────────────────────────── */}
      <p style={{ fontSize: 13, color: MUTED, margin: 0, maxWidth: 640, lineHeight: 1.5 }}>
        Set your plan, add your cards, and upload photos. CardzCheck estimates the likely grade and projects whether grading is worth it.
      </p>

      {/* ── Step 1: Plan ──────────────────────────────────────────────────── */}
      <div style={{ border: `1px solid ${BORDER}`, background: SURFACE, borderRadius: 4, padding: 18 }}>
        <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: MUTED, margin: "0 0 14px" }}>
          1 · Your plan
        </p>

        <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          {/* Grading company */}
          <div>
            <label style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: MUTED }}>Grading company</label>
            <div style={{ display: "flex", gap: 6, marginTop: 7 }}>
              {GRADING_COMPANIES.map((co) => (
                <button
                  key={co}
                  type="button"
                  onClick={() => setCompany(co)}
                  style={{
                    flex: 1, padding: "8px 0", fontSize: 12, fontWeight: 700, letterSpacing: "0.04em",
                    color: company === co ? "#07100B" : DIM,
                    background: company === co ? GREEN : "transparent",
                    border: `1px solid ${company === co ? GREEN : BORDER}`,
                    borderRadius: 3, cursor: "pointer",
                  }}
                >
                  {co}
                </button>
              ))}
            </div>
          </div>

          {/* Total grading cost */}
          <div>
            <label style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: MUTED }}>Total grading cost ($)</label>
            <input
              type="text"
              inputMode="decimal"
              value={totalGradingCost}
              onChange={(e) => setTotalGradingCost(e.target.value)}
              placeholder="e.g. 80"
              style={{ ...inputStyle, marginTop: 7 }}
            />
            <p style={{ fontSize: 10, color: MUTED, margin: "6px 0 0" }}>
              Split across {cards.length} card{cards.length !== 1 ? "s" : ""}
              {toMoney(totalGradingCost) > 0 ? ` · ~$${Math.round(perCardGradingCost)} each` : ""}
            </p>
          </div>
        </div>

        {/* Goals / expectations */}
        <div style={{ marginTop: 14 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7 }}>
            <label style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: MUTED }}>Goals & expectations (optional)</label>
            <MicButton size="sm" onResult={(text) => setGoals((prev) => appendSpeechTranscript(prev, text, "newline"))} className="h-7 w-7 rounded border border-white/10 bg-white/5 text-white/50 hover:bg-white/10" />
          </div>
          <textarea
            rows={2}
            maxLength={400}
            value={goals}
            onChange={(e) => setGoals(e.target.value)}
            placeholder="e.g. Only worth it if I can flip PSA 10s for a solid margin…"
            style={{ ...inputStyle, lineHeight: 1.5, resize: "vertical", minHeight: 52 }}
          />
        </div>
      </div>

      {/* ── Step 2: Cards ─────────────────────────────────────────────────── */}
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: MUTED, margin: 0 }}>
            2 · Your cards ({cards.length})
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <AnimatePresence initial={false}>
            {cards.map((card, index) => {
              const projection = projectionFor(card.result);
              const identified = card.result?.card ?? null;
              const estimate = card.result?.estimate ?? null;
              const isDone = card.slotState === "done";
              const gradeLabel = estimate
                ? estimate.estimated_grade_low === estimate.estimated_grade_high
                  ? `${company} ${estimate.estimated_grade_low}`
                  : `${company} ${estimate.estimated_grade_low}–${estimate.estimated_grade_high}`
                : "—";

              return (
                <motion.div
                  key={card.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0, overflow: "hidden" }}
                  transition={{ duration: 0.18 }}
                  style={{ border: `1px solid ${isDone ? "rgba(32,178,107,0.3)" : BORDER}`, borderLeft: `3px solid ${isDone ? GREEN : BORDER}`, borderRadius: 4, background: SURFACE, overflow: "hidden" }}
                >
                  {/* Header */}
                  <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 16px", borderBottom: `1px solid ${BORDER}` }}>
                    <span style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: TEXT, minWidth: 56 }}>{cardLabel(index)}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {identified ? (
                        <p style={{ fontSize: 12, color: TEXT, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {[identified.year, identified.set_name, identified.player_name, identified.card_number ? `#${identified.card_number}` : null].filter(Boolean).join(" ")}
                        </p>
                      ) : (
                        <p style={{ fontSize: 12, color: MUTED, fontStyle: "italic", margin: 0 }}>Add cost and upload front + back</p>
                      )}
                    </div>
                    <StatusBadge state={card.slotState} />
                    {cards.length > 1 && card.slotState !== "analyzing" && (
                      <button
                        type="button"
                        onClick={() => removeCard(card.id)}
                        style={{ background: "none", border: "none", color: MUTED, cursor: "pointer", fontSize: 16, lineHeight: 1, padding: "0 2px" }}
                        title="Remove card"
                      >
                        ×
                      </button>
                    )}
                  </div>

                  {/* Body — two columns on desktop */}
                  <div style={{ display: "grid", gap: 0, gridTemplateColumns: "minmax(0, 1fr)" }} className="roi-card-grid">
                    {/* Left: cost + upload */}
                    <div style={{ padding: 16, borderRight: `1px solid ${BORDER}`, display: "flex", flexDirection: "column", gap: 14 }}>
                      <div>
                        <label style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: MUTED }}>What you paid for this card ($)</label>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={card.cardCost}
                          onChange={(e) => updateCard(card.id, { cardCost: e.target.value })}
                          placeholder="e.g. 40"
                          style={{ ...inputStyle, marginTop: 7 }}
                        />
                      </div>
                      <div>
                        <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.16em", color: MUTED, textTransform: "uppercase", margin: "0 0 10px" }}>
                          Upload front and back photos
                        </p>
                        <CardScanSlot
                          slotIndex={index}
                          totalSlots={1}
                          hideInlineResults
                          hidePreScanNotesEditor
                          onStateChange={(_, state) => handleSlotStateChange(card.id, state)}
                          onComplete={(result) => handleComplete(card.id, result)}
                          initialNotes={`${buildDeclaredScanPrefaceFromTitle({ cardTitle: "", gradingCompany: company })}${goals ? goals : ""}`}
                        />
                      </div>
                    </div>

                    {/* Right: projection */}
                    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12, background: "#0B0E11" }}>
                      {projection && projection.available ? (
                        <SimpleProjectionPanel
                          company={company}
                          gradeLabel={gradeLabel}
                          confidence={identified?.confidence ?? projection.confidence}
                          projectedValue={projection.probability.expectedValue}
                          psa10Value={projection.psa10Value}
                          psa9Value={projection.psa9Value}
                          probability={projection.probability}
                          cardCost={toMoney(card.cardCost)}
                          gradingCost={perCardGradingCost}
                        />
                      ) : card.slotState === "analyzing" ? (
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: "48px 16px", textAlign: "center" }}>
                          <div style={{ width: 22, height: 22, borderRadius: "50%", border: `2px solid ${GREEN}`, borderTopColor: "transparent", animation: "spin 0.8s linear infinite" }} />
                          <p style={{ fontSize: 12, color: MUTED, margin: 0 }}>Estimating grade and pulling live market comps…</p>
                        </div>
                      ) : isDone ? (
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "48px 16px", textAlign: "center" }}>
                          <p style={{ fontSize: 12, color: MUTED, margin: 0 }}>Grade estimated, but not enough recent sales to project profit for this card.</p>
                        </div>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, padding: "48px 16px", textAlign: "center", border: `1px dashed ${BORDER}`, borderRadius: 4 }}>
                          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={MUTED} strokeWidth={1.4}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5V18a2 2 0 002 2h14a2 2 0 002-2v-1.5M7 9l5-5 5 5M12 4v12" />
                          </svg>
                          <p style={{ fontSize: 12, color: DIM, margin: 0, fontWeight: 600 }}>Is this card worth grading?</p>
                          <p style={{ fontSize: 11, color: MUTED, margin: 0, maxWidth: 240, lineHeight: 1.5 }}>
                            Upload front and back to see the estimated grade, confidence, and projected profit.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>

        {/* Add card */}
        {cards.length < maxCards ? (
          <button
            type="button"
            onClick={addCard}
            style={{ marginTop: 14, padding: "11px", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: MUTED, background: SURFACE_SOFT, border: `1px dashed ${BORDER}`, borderRadius: 4, cursor: "pointer", width: "100%" }}
          >
            + Add Another Card ({cards.length}/{maxCards})
          </button>
        ) : tier !== "business" ? (
          <p style={{ marginTop: 14, textAlign: "center", fontSize: 11, color: MUTED }}>
            {tier === "free" ? "Upgrade to add more cards" : `${maxCards} card limit reached`}
          </p>
        ) : null}
      </div>

      {/* ── Disclaimer ────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "12px 14px", background: SURFACE_SOFT, border: `1px solid ${BORDER}`, borderRadius: 4 }}>
        <svg width="15" height="15" viewBox="0 0 20 20" fill={MUTED} style={{ flexShrink: 0, marginTop: 1 }}>
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
        </svg>
        <p style={{ fontSize: 11, color: MUTED, margin: 0, lineHeight: 1.55 }}>
          These are speculative estimates from an AI tool, not guarantees. Actual grades, market values, and profits can differ significantly. Nothing here guarantees a grade or a return — use it as one input, not financial advice.
        </p>
      </div>

      {/* ── Footer actions ───────────────────────────────────────────────── */}
      {anyDone && (
        <div style={{ display: "flex", gap: 10 }}>
          <button
            type="button"
            onClick={() => router.push(hubPath)}
            style={{ flex: 1, padding: "11px", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: MUTED, background: SURFACE_SOFT, border: `1px solid ${BORDER}`, borderRadius: 4, cursor: "pointer" }}
          >
            Back to Grading
          </button>
          <button
            type="button"
            onClick={() => setCards([makeCard(0)])}
            style={{ flex: 1, padding: "11px", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#07100B", background: GREEN, border: "none", borderRadius: 4, cursor: "pointer" }}
          >
            New Simulation
          </button>
        </div>
      )}

      {/* Responsive: two columns on wider screens */}
      <style jsx>{`
        @media (min-width: 880px) {
          :global(.roi-card-grid) {
            grid-template-columns: minmax(0, 1fr) minmax(0, 1.05fr) !important;
          }
        }
      `}</style>
    </div>
  );
}
