"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import CardScanSlot, { type SlotState } from "@/components/grading/CardScanSlot";
import { MicButton } from "@/components/ui/MicButton";
import {
  buildDeclaredScanPrefaceFromTitle,
  buildParsedCardDetailLine,
} from "@/lib/grading/cardTitleInput";
import { appendSpeechTranscript } from "@/lib/speech";

// ── Design tokens ─────────────────────────────────────────────────────────────
const BG         = "#FFFFFF";
const SURFACE    = "#F7F7F7";
const RED        = "#B91C1C";
const RED_DIM    = "rgba(185,28,28,0.08)";
const RED_BORDER = "rgba(185,28,28,0.25)";
const TEXT       = "#111111";
const MUTED      = "#888888";
const BORDER     = "#E5E5E5";

type GradingCompany = "PSA" | "BGS" | "SGC";

const GRADING_COMPANIES: GradingCompany[] = ["PSA", "BGS", "SGC"];

const TIER_MAX_CARDS: Record<string, number> = {
  free:     2,
  pro:      5,
  business: 10,
};

// ── Per-card metadata ─────────────────────────────────────────────────────────
interface SubmissionCard {
  id:         string;
  cardTitle:  string;
  notes:      string;
  slotState:  SlotState;
  expanded:   boolean;
}

function makeCard(index: number): SubmissionCard {
  return {
    id:         `card-${Date.now()}-${index}`,
    cardTitle:  "",
    notes:      "",
    slotState:  "idle",
    expanded:   true,
  };
}

function cardLabel(index: number) {
  return `Card ${String(index + 1).padStart(2, "0")}`;
}

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ state }: { state: SlotState }) {
  if (state === "done") return (
    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", color: "#166534", background: "#dcfce7", border: "1px solid #bbf7d0", borderRadius: 2, padding: "3px 8px" }}>
      Complete
    </span>
  );
  if (state === "analyzing") return (
    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", color: RED, background: RED_DIM, border: `1px solid ${RED_BORDER}`, borderRadius: 2, padding: "3px 8px" }}>
      Analyzing…
    </span>
  );
  if (state === "error") return (
    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", color: "#991b1b", background: "#fee2e2", border: "1px solid #fecaca", borderRadius: 2, padding: "3px 8px" }}>
      Error
    </span>
  );
  if (state === "ready") return (
    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", color: "#92400e", background: "#fef3c7", border: "1px solid #fde68a", borderRadius: 2, padding: "3px 8px" }}>
      Ready
    </span>
  );
  return (
    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", color: MUTED, background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 2, padding: "3px 8px" }}>
      Collecting
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
interface MockSubmissionFlowProps {
  tier:       string;
  tierLoaded: boolean;
}

export default function MockSubmissionFlow({ tier, tierLoaded }: MockSubmissionFlowProps) {
  const router   = useRouter();
  const pathname = usePathname();
  const hubPath  = pathname?.startsWith("/business") ? "/business/grade-hub" : "/grade-hub";

  const maxCards          = TIER_MAX_CARDS[tier] ?? 2;
  const [company, setCompany]   = useState<GradingCompany>("PSA");
  const [cards, setCards]       = useState<SubmissionCard[]>([makeCard(0)]);
  const [analysisStarted, setAnalysisStarted] = useState(false);

  // Clamp cards to tier max when tier loads
  useEffect(() => {
    if (tierLoaded) {
      setCards((prev) => prev.slice(0, maxCards));
    }
  }, [tierLoaded, maxCards]);

  // ── Card list mutations ───────────────────────────────────────────────────
  const addCard = useCallback(() => {
    setCards((prev) => {
      if (prev.length >= maxCards) return prev;
      return [...prev, makeCard(prev.length)];
    });
  }, [maxCards]);

  const removeCard = useCallback((id: string) => {
    setCards((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((c) => c.id !== id);
    });
  }, []);

  const updateCard = useCallback((id: string, patch: Partial<SubmissionCard>) => {
    setCards((prev) => prev.map((c) => c.id === id ? { ...c, ...patch } : c));
  }, []);

  const appendVoiceToCardField = useCallback(
    (
      id: string,
      field: "cardTitle" | "notes",
      transcript: string,
      mode: "space" | "newline" = "space"
    ) => {
      setCards((prev) =>
        prev.map((card) =>
          card.id === id
            ? { ...card, [field]: appendSpeechTranscript(card[field], transcript, mode) }
            : card
        )
      );
    },
    []
  );

  const toggleExpand = useCallback((id: string) => {
    setCards((prev) => prev.map((c) => c.id === id ? { ...c, expanded: !c.expanded } : c));
  }, []);

  const handleSlotStateChange = useCallback((cardId: string, state: SlotState) => {
    updateCard(cardId, { slotState: state });
  }, [updateCard]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const doneCount     = cards.filter((c) => c.slotState === "done").length;
  const analyzingCount = cards.filter((c) => c.slotState === "analyzing").length;
  const allDone       = doneCount === cards.length && cards.length > 0;
  const anyAnalyzing  = analyzingCount > 0;

  // ── Progress bar ──────────────────────────────────────────────────────────
  const progressPct = cards.length > 0 ? Math.round((doneCount / cards.length) * 100) : 0;

  if (!tierLoaded) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "80px 0" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 22, height: 22, borderRadius: "50%", border: `2px solid ${RED}`, borderTopColor: "transparent", margin: "0 auto 10px", animation: "spin 0.8s linear infinite" }} />
          <p style={{ fontSize: 12, color: MUTED }}>Loading…</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>

      {/* ── Submission header ───────────────────────────────────────────── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 16,
        padding: "14px 20px",
        background: SURFACE,
        border: `1px solid ${BORDER}`,
        borderTop: `3px solid ${RED}`,
        borderRadius: 2,
        marginBottom: 2,
        flexWrap: "wrap",
      }}>
        {/* Card count */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <span style={{ fontFamily: "monospace", fontSize: 22, fontWeight: 700, color: TEXT, lineHeight: 1 }}>
            {cards.length}
          </span>
          <span style={{ fontSize: 10, color: MUTED, textTransform: "uppercase", letterSpacing: "1px", fontWeight: 700 }}>
            card{cards.length !== 1 ? "s" : ""} in submission
          </span>
        </div>

        {/* Divider */}
        <div style={{ width: 1, height: 24, background: BORDER, flexShrink: 0 }} />

        {/* Grading company */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "1px", color: MUTED, textTransform: "uppercase" }}>
            Grader
          </span>
          <div style={{ display: "flex", gap: 4 }}>
            {GRADING_COMPANIES.map((co) => (
              <button
                key={co}
                type="button"
                onClick={() => setCompany(co)}
                style={{
                  padding: "4px 10px",
                  fontSize: 10, fontWeight: 700, letterSpacing: "0.5px",
                  color: company === co ? "#fff" : MUTED,
                  background: company === co ? RED : "transparent",
                  border: `1px solid ${company === co ? RED : BORDER}`,
                  borderRadius: 2, cursor: "pointer",
                }}
              >
                {co}
              </button>
            ))}
          </div>
        </div>

        {/* Divider */}
        <div style={{ width: 1, height: 24, background: BORDER, flexShrink: 0 }} />

        {/* Per-card photo note */}
        <span style={{ fontSize: 10, color: MUTED }}>
          Front + back required per card · up to 10 photos each
        </span>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Add card */}
        {cards.length < maxCards && (
          <button
            type="button"
            onClick={addCard}
            style={{
              padding: "7px 16px",
              fontSize: 10, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase",
              color: RED, background: "none",
              border: `1px solid ${RED_BORDER}`,
              borderRadius: 2, cursor: "pointer",
              flexShrink: 0,
            }}
          >
            + Add Card
          </button>
        )}
        {cards.length >= maxCards && tier !== "business" && (
          <span style={{ fontSize: 10, color: MUTED }}>
            {tier === "free" ? "Upgrade to add more" : `${maxCards} card limit`}
          </span>
        )}
      </div>

      {/* ── Analysis progress bar (when running) ────────────────────────── */}
      {analysisStarted && (
        <div style={{ marginBottom: 2 }}>
          <div style={{ height: 3, background: BORDER }}>
            <div style={{ height: "100%", background: RED, width: `${progressPct}%`, transition: "width 0.4s ease" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 4px 0" }}>
            <span style={{ fontSize: 10, color: MUTED }}>
              {anyAnalyzing ? `Analyzing…` : allDone ? "All cards complete" : `${doneCount} of ${cards.length} complete`}
            </span>
            <span style={{ fontSize: 10, color: MUTED, fontFamily: "monospace" }}>{progressPct}%</span>
          </div>
        </div>
      )}

      {/* ── Card rows ────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <AnimatePresence initial={false}>
          {cards.map((card, index) => {
            const detailLine = buildParsedCardDetailLine(card.cardTitle);

            return (
              <motion.div
                key={card.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0, overflow: "hidden" }}
                transition={{ duration: 0.18 }}
              >
                <div style={{
                border: `1px solid ${card.slotState === "done" ? "#bbf7d0" : BORDER}`,
                borderLeft: `3px solid ${
                  card.slotState === "done"     ? "#22c55e" :
                  card.slotState === "analyzing"? RED :
                  card.slotState === "error"    ? "#ef4444" :
                  BORDER
                }`,
                borderRadius: 2,
                background: BG,
                overflow: "hidden",
              }}>

                {/* Row header — always visible */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => !analysisStarted && toggleExpand(card.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      if (!analysisStarted) toggleExpand(card.id);
                    }
                  }}
                  style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "12px 16px",
                    cursor: analysisStarted ? "default" : "pointer",
                    background: card.expanded ? SURFACE : BG,
                    borderBottom: card.expanded ? `1px solid ${BORDER}` : "none",
                    userSelect: "none",
                  }}
                >
                  {/* Card number */}
                  <span style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: TEXT, flexShrink: 0, minWidth: 60 }}>
                    {cardLabel(index)}
                  </span>

                  {/* Card identity */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {card.cardTitle ? (
                      <>
                        <p style={{ fontSize: 12, color: TEXT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {card.cardTitle}
                        </p>
                        {detailLine && (
                          <p style={{ fontSize: 10, color: MUTED, marginTop: 1 }}>
                            {detailLine}
                          </p>
                        )}
                      </>
                    ) : (
                      <p style={{ fontSize: 12, color: MUTED, fontStyle: "italic" }}>No details yet</p>
                    )}
                  </div>

                  {/* Status + company badge */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                    <StatusBadge state={card.slotState} />
                    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.8px", color: MUTED, textTransform: "uppercase" }}>
                      {company}
                    </span>
                  </div>

                  {/* Remove button (only before analysis) */}
                  {!analysisStarted && cards.length > 1 && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); removeCard(card.id); }}
                      style={{ background: "none", border: "none", color: MUTED, cursor: "pointer", padding: "2px 4px", flexShrink: 0, fontSize: 16, lineHeight: 1 }}
                      title="Remove card"
                    >
                      ×
                    </button>
                  )}

                  {/* Expand chevron */}
                  {!analysisStarted && (
                    <svg
                      width="12" height="12" fill="none" stroke={MUTED} viewBox="0 0 24 24"
                      style={{ flexShrink: 0, transform: card.expanded ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  )}
                </div>

                {/* Expanded body — card details + scan slot */}
                <AnimatePresence initial={false}>
                  {card.expanded && (
                    <motion.div
                      key="body"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.18 }}
                      style={{ overflow: "hidden" }}
                    >
                      <div style={{ padding: "20px 16px", display: "flex", flexDirection: "column", gap: 16 }}>

                        {/* Card details — 2 rows */}
                        {!analysisStarted && (
                          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                            <div>
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 6 }}>
                                <label style={{ display: "block", fontSize: 9, fontWeight: 700, letterSpacing: "1.5px", color: RED, textTransform: "uppercase" }}>
                                  Card Title
                                </label>
                                <MicButton
                                  size="sm"
                                  onResult={(text) => appendVoiceToCardField(card.id, "cardTitle", text)}
                                  className="h-7 w-7 rounded border border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
                                />
                              </div>
                              <input
                                type="text"
                                value={card.cardTitle}
                                onChange={(e) => updateCard(card.id, { cardTitle: e.target.value })}
                                placeholder="e.g. 2021 Prizm Luka Doncic Silver #3"
                                style={{
                                  display: "block", width: "100%", boxSizing: "border-box",
                                  padding: "9px 11px", fontSize: 13, color: TEXT,
                                  background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 2, outline: "none",
                                }}
                                onFocus={(e) => (e.target.style.borderColor = RED)}
                                onBlur={(e) => (e.target.style.borderColor = BORDER)}
                              />
                              <p style={{ fontSize: 11, color: MUTED, marginTop: 8, lineHeight: 1.5 }}>
                                Enter the full card name once. The engine will parse the rest from the title when it can.
                              </p>
                            </div>
                            <div>
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 6 }}>
                                <label style={{ display: "block", fontSize: 9, fontWeight: 700, letterSpacing: "1.5px", color: MUTED, textTransform: "uppercase" }}>
                                  Notes for the Model
                                  <span style={{ fontWeight: 400, marginLeft: 6 }}>(optional)</span>
                                </label>
                                <MicButton
                                  size="sm"
                                  onResult={(text) => appendVoiceToCardField(card.id, "notes", text, "newline")}
                                  className="h-7 w-7 rounded border border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
                                />
                              </div>
                              <textarea
                                rows={2}
                                maxLength={400}
                                value={card.notes}
                                onChange={(e) => updateCard(card.id, { notes: e.target.value })}
                                placeholder="e.g. slight print line on back, centering looks close but slightly left heavy…"
                                style={{
                                  display: "block", width: "100%", boxSizing: "border-box",
                                  padding: "9px 11px", fontSize: 12, color: TEXT, lineHeight: 1.5,
                                  background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 2, outline: "none",
                                  resize: "vertical", minHeight: 64,
                                }}
                                onFocus={(e) => (e.target.style.borderColor = RED)}
                                onBlur={(e) => (e.target.style.borderColor = BORDER)}
                              />
                            </div>
                          </div>
                        )}

                        {/* Scan slot — always present for photo upload + analysis */}
                        <div style={{ borderTop: !analysisStarted ? `1px solid ${BORDER}` : "none", paddingTop: !analysisStarted ? 16 : 0 }}>
                          {!analysisStarted && (
                            <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: "1.5px", color: MUTED, textTransform: "uppercase", marginBottom: 12 }}>
                              Photos
                            </p>
                          )}
                          <CardScanSlot
                            slotIndex={index}
                            totalSlots={cards.length}
                            onStateChange={(_, state) => {
                              handleSlotStateChange(card.id, state);
                              // Auto-collapse when done
                              if (state === "done") updateCard(card.id, { expanded: false });
                            }}
                            initialNotes={`${buildDeclaredScanPrefaceFromTitle({
                              cardTitle: card.cardTitle,
                              gradingCompany: company,
                            })}${card.notes ? card.notes : ""}`}
                          />
                        </div>

                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* ── Add card footer (before analysis) ───────────────────────────── */}
      {!analysisStarted && cards.length < maxCards && (
        <button
          type="button"
          onClick={addCard}
          style={{
            marginTop: 2,
            padding: "11px",
            fontSize: 11, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase",
            color: MUTED, background: SURFACE,
            border: `1px dashed ${BORDER}`,
            borderRadius: 2, cursor: "pointer", width: "100%",
          }}
        >
          + Add Another Card ({cards.length}/{maxCards})
        </button>
      )}

      {/* ── Post-analysis actions ────────────────────────────────────────── */}
      {allDone && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          style={{ marginTop: 16, display: "flex", gap: 10 }}
        >
          <button
            type="button"
            onClick={() => router.push(hubPath)}
            style={{
              flex: 1, padding: "11px",
              fontSize: 11, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase",
              color: MUTED, background: SURFACE,
              border: `1px solid ${BORDER}`, borderRadius: 2, cursor: "pointer",
            }}
          >
            Back to Hub
          </button>
          <button
            type="button"
            onClick={() => {
              setCards([makeCard(0)]);
              setAnalysisStarted(false);
            }}
            style={{
              flex: 1, padding: "11px",
              fontSize: 11, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase",
              color: "#fff", background: RED,
              border: "none", borderRadius: 2, cursor: "pointer",
            }}
          >
            New Submission
          </button>
        </motion.div>
      )}

    </div>
  );
}
