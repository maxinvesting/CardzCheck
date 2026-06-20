"use client";

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { MicButton } from "@/components/ui/MicButton";
import { SpeakButton } from "@/components/ui/SpeakButton";
import { appendSpeechTranscript } from "@/lib/speech";
import type { BusinessConsultation } from "@/types";
import type { BusinessConsultantReport } from "@/lib/business/consultant-report";
import {
  formatConsultantChatText,
  parseBusinessConsultantReport,
} from "@/lib/business/consultant-report";

// ─── Constants ───────────────────────────────────────────────────────────────

const QUICK_PROMPTS = [
  "What should I discount vs hold?",
  "Identify dead capital in my inventory",
  "Which raw cards are best grading candidates?",
  "Build a 30-day liquidity plan",
  "Show overpriced listings versus CMV",
  "Which cards should I cross-list first?",
  "Analyze margin compression risks",
  "Which should be auction vs Buy It Now?",
] as const;

const TEMPLATES = [
  {
    id: "inventory_strategy",
    label: "Inventory Strategy",
    example: "Identify dead capital in my inventory and propose a 30-day plan to redeploy it.",
  },
  {
    id: "pricing_decisions",
    label: "Pricing Decisions",
    example: "Review my pricing and highlight items that look overpriced or underpriced versus CMV.",
  },
  {
    id: "grading_analysis",
    label: "Grading Analysis",
    example: "Which raw cards in inventory look like good grading candidates versus selling raw?",
  },
  {
    id: "liquidity_planning",
    label: "Liquidity Planning",
    example:
      "Build a 30-day liquidity plan that raises cash while minimizing long-term profit sacrifice.",
  },
] as const;

const CONTEXT_STATS_PLACEHOLDER = [
  { label: "Inventory items", value: "—" },
  { label: "Est. total value", value: "—" },
  { label: "Recent sales (30d)", value: "—" },
  { label: "Graded / Raw", value: "— / —" },
  { label: "Active listings", value: "—" },
  { label: "Dead capital est.", value: "—" },
] as const;

const SUGGESTED_ACTIONS = [
  { icon: "↓", label: "Discount selected items" },
  { icon: "◎", label: "Mark cards as Hold" },
  { icon: "★", label: "Flag grading candidates" },
  { icon: "≡", label: "Build liquidation list" },
  { icon: "⟲", label: "Review pricing outliers" },
] as const;

const WORKING_STATUS_LINES = [
  "Reviewing inventory and sales data...",
  "Drafting action plan...",
  "Finalizing recommendations...",
  "Modeling margin structure...",
  "Analyzing channel distribution...",
];

const STATUS_ROTATE_MS = 2200;

// ─── Types ───────────────────────────────────────────────────────────────────

type TemplateId = (typeof TEMPLATES)[number]["id"] | "custom";
type ViewMode = "chat" | "report";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  report: BusinessConsultantReport | null;
  consultationId: string | null;
  timestamp: Date;
}

// ─── Theme ───────────────────────────────────────────────────────────────────
// Inherits the global "Merchant Desk" dark tokens from styles/businessTheme.css
// (near-black canvas, champagne-gold hairlines) — same language as the dashboard.

const glassPanelClass = "desk-panel";

const panelClass = "rounded-xl border border-[var(--biz-border)] bg-[var(--biz-surface)]";

// ─── Utilities ───────────────────────────────────────────────────────────────

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const handler = () => setReduced(mq.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return reduced;
}

function renderInline(text: string, keyBase: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={`${keyBase}-b-${i}`} className="font-semibold text-[var(--biz-text)]">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={`${keyBase}-t-${i}`}>{part}</span>;
  });
}

function formatHeading(line: string): string {
  return line.replace(/^#{1,6}\s*/, "").replace(/AI Insights/gi, "Market Ideas").trim();
}

function formatReportTimestamp(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatContextMetric(
  summary: Record<string, unknown> | null,
  key: string,
  suffix = ""
): string | null {
  if (!summary || typeof summary !== "object") return null;
  const value = summary[key];
  if (typeof value === "number" && Number.isFinite(value)) {
    return `${value.toLocaleString(undefined, { maximumFractionDigits: suffix ? 1 : 0 })}${suffix}`;
  }
  if (typeof value === "string" && value.trim()) return `${value}${suffix}`;
  return null;
}

function buildSpeakableText(msg: ChatMessage): string {
  const { report, content } = msg;
  if (!report) return content;
  if (report.response_mode === "answer") {
    return [report.answer, ...report.key_points.slice(0, 3)].filter(Boolean).join(". ");
  }
  return [
    report.report_title,
    ...report.kpis.slice(0, 3).map((k) => `${k.label}: ${k.value}`),
    ...report.recommended_actions.slice(0, 2).map((a) => a.action),
  ]
    .filter(Boolean)
    .join(". ");
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function ConsultantResponse({ text }: { text: string }) {
  const lines = text
    .replace(/\r\n/g, "\n")
    .replace(/AI Insights/gi, "Market Ideas")
    .split("\n");
  const content: ReactNode[] = [];
  const bulletBuffer: string[] = [];
  let key = 0;

  const flushBullets = () => {
    if (bulletBuffer.length === 0) return;
    content.push(
      <ul
        key={`ul-${key++}`}
        className="my-3 list-disc space-y-1.5 pl-5 text-sm leading-7 text-[var(--biz-text)]"
      >
        {bulletBuffer.map((item, i) => (
          <li key={`li-${key}-${i}`}>{renderInline(item, `li-${key}-${i}`)}</li>
        ))}
      </ul>
    );
    bulletBuffer.length = 0;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || /^-{3,}$/.test(line)) {
      flushBullets();
      continue;
    }
    const headingMatch = line.match(/^#{1,3}\s+/);
    if (headingMatch) {
      flushBullets();
      content.push(
        <h3 key={`h-${key++}`} className="mt-5 text-base font-semibold tracking-tight text-[var(--biz-text-strong)]">
          {formatHeading(line)}
        </h3>
      );
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      bulletBuffer.push(line.replace(/^[-*]\s+/, ""));
      continue;
    }
    flushBullets();
    content.push(
      <p key={`p-${key++}`} className="my-2 text-sm leading-7 text-[var(--biz-text)]">
        {renderInline(line, `p-${key}`)}
      </p>
    );
  }
  flushBullets();

  return (
    <div className="text-[15px] leading-7 text-[var(--biz-text)]">
      {content.length > 0 ? (
        content
      ) : (
        <p className="text-sm text-[var(--biz-muted)]">No analysis text returned.</p>
      )}
    </div>
  );
}

function ConsultantChatBubble({
  report,
  rawText,
}: {
  report: BusinessConsultantReport | null;
  rawText: string;
}) {
  const displayText = formatConsultantChatText(report, rawText);
  return <ConsultantResponse text={displayText} />;
}

function ConsultantReportView({
  report,
  rawText,
  forceFullReport = false,
}: {
  report: BusinessConsultantReport | null;
  rawText: string;
  forceFullReport?: boolean;
}) {
  const trimmed = rawText.trim();

  if (!report && !trimmed) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--biz-border)] bg-[var(--biz-surface-soft)] px-5 py-8 text-center">
        <p className="text-sm text-[var(--biz-muted)]">
          Run an analysis to see a structured report based on your inventory and sales data.
        </p>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="space-y-3">
        <p className="text-xs uppercase tracking-[0.18em] text-[var(--biz-muted)]">
          Showing formatted text output
        </p>
        <ConsultantResponse text={trimmed} />
      </div>
    );
  }

  const isAnswerMode = !forceFullReport && report.response_mode === "answer";
  const hasHighRisk = report.high_risk_positions.length > 0;
  const hasActions = report.recommended_actions.length > 0;
  const hasNotes = report.notes.length > 0;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold tracking-tight text-[var(--biz-text)]">
            {report.report_title || "Advisor Report"}
          </h3>
          <p className="mt-0.5 text-xs text-[var(--biz-muted)]">
            {formatReportTimestamp(report.timestamp)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-[11px]">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--biz-border)] bg-[var(--biz-surface-soft)] px-3 py-1 text-[var(--biz-muted)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--biz-primary)]" />
            Inventory {report.data_coverage.inventory_count.toLocaleString()}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--biz-border)] bg-[var(--biz-surface-soft)] px-3 py-1 text-[var(--biz-muted)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--biz-primary)]" />
            Sales {report.data_coverage.sales_count.toLocaleString()}
          </span>
          {report.data_coverage.missing.length > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--biz-warning-border)] bg-[var(--biz-warning-soft)] px-3 py-1 text-[var(--biz-warning)]">
              Missing: {report.data_coverage.missing.join(", ")}
            </span>
          )}
        </div>
      </header>

      {isAnswerMode && report.answer && (
        <div className="rounded-[16px] border border-[var(--biz-border)] bg-[var(--biz-surface-soft)] px-5 py-4 space-y-3">
          <p className="whitespace-pre-line text-sm leading-7 text-[var(--biz-text)]">{report.answer}</p>
          {report.key_points.length > 0 && (
            <ul className="space-y-1.5 border-t border-[var(--biz-border)] pt-3">
              {report.key_points.map((point, idx) => (
                <li key={idx} className="flex gap-2.5 text-sm leading-6 text-[var(--biz-muted)]">
                  <span className="mt-0.5 shrink-0 text-[var(--biz-primary)]">—</span>
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {!isAnswerMode && report.kpis.length > 0 && (
        <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
          {report.kpis.map((kpi) => (
            <div
              key={kpi.label}
              className="rounded-[16px] border border-[var(--biz-border)] bg-[var(--biz-surface-soft)] px-4 py-3"
            >
              <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--biz-muted)]">
                {kpi.label}
              </p>
              <p className="mt-1.5 text-base font-semibold tracking-tight text-[var(--biz-text)]">
                {kpi.value}
              </p>
              {kpi.hint && (
                <p className="mt-1 text-xs leading-5 text-[var(--biz-muted)]">{kpi.hint}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {!isAnswerMode && hasHighRisk && (
        <section className="space-y-2.5">
          <h4 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--biz-muted)]">
            High-Risk Positions
          </h4>
          <div className="overflow-hidden rounded-[16px] border border-[var(--biz-border)] bg-[var(--biz-surface-soft)]">
            <div className="grid grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.9fr)] gap-x-3 border-b border-[var(--biz-border)] px-4 py-2 text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--biz-muted)]">
              <span>Item</span>
              <span className="text-right">Cost</span>
              <span className="text-right">CMV</span>
              <span className="text-right">Delta</span>
            </div>
            <div className="divide-y divide-[var(--biz-border)] text-sm">
              {report.high_risk_positions.map((pos) => (
                <div
                  key={`${pos.item}-${pos.reason}`}
                  className="grid grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.9fr)] gap-x-3 px-4 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[var(--biz-text)]">{pos.item}</p>
                    {pos.reason && (
                      <p className="mt-0.5 text-xs leading-5 text-[var(--biz-muted)]">{pos.reason}</p>
                    )}
                  </div>
                  <div className="text-right tabular-nums text-[var(--biz-text)]">
                    {pos.cost_basis.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </div>
                  <div className="text-right tabular-nums text-[var(--biz-text)]">
                    {pos.cmv.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </div>
                  <div className="text-right tabular-nums text-[var(--biz-warning)]">
                    {pos.delta_pct.toFixed(1)}%
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {hasActions && (
        <section className="space-y-2.5">
          <h4 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--biz-muted)]">
            Recommended Actions
          </h4>
          <ul className="space-y-2 text-sm leading-7 text-[var(--biz-text)]">
            {report.recommended_actions.map((act, idx) => (
              <li
                key={`${act.action}-${idx}`}
                className="rounded-[16px] border border-[var(--biz-border)] bg-[var(--biz-surface-soft)] px-4 py-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-[var(--biz-text)]">{act.action}</p>
                    {act.impact && (
                      <p className="mt-1 text-sm leading-6 text-[var(--biz-muted)]">{act.impact}</p>
                    )}
                  </div>
                  <span className="shrink-0 rounded-full border border-[var(--biz-border)] bg-[var(--biz-surface-soft)] px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-[var(--biz-muted)]">
                    {act.effort}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {hasNotes && (
        <section className="space-y-2.5">
          <h4 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--biz-muted)]">
            Notes
          </h4>
          <ul className="space-y-2 text-sm leading-7 text-[var(--biz-text)]">
            {report.notes.map((note, idx) => (
              <li
                key={idx}
                className="rounded-[16px] border border-[var(--biz-border)] bg-[var(--biz-surface-soft)] px-4 py-3"
              >
                {note}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function BusinessConsultantPanel({ initialPrompt }: { initialPrompt?: string } = {}) {
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>("chat");
  const [selectedTemplateId, setSelectedTemplateId] = useState<TemplateId>("custom");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [advancedContext, setAdvancedContext] = useState("");
  const [phase, setPhase] = useState<"idle" | "working" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [historyNotice, setHistoryNotice] = useState<string | null>(null);
  const [consultations, setConsultations] = useState<BusinessConsultation[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [activeConsultationId, setActiveConsultationId] = useState<string | null>(null);
  const [statusLineIndex, setStatusLineIndex] = useState(0);

  const statusIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const acknowledgeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const threadEndRef = useRef<HTMLDivElement | null>(null);
  const reducedMotion = useReducedMotion();

  const clearTimers = useCallback(() => {
    if (statusIntervalRef.current) {
      clearInterval(statusIntervalRef.current);
      statusIntervalRef.current = null;
    }
    if (acknowledgeTimeoutRef.current) {
      clearTimeout(acknowledgeTimeoutRef.current);
      acknowledgeTimeoutRef.current = null;
    }
  }, []);

  // Pre-fill prompt from URL param (passed from ledger action buttons)
  useEffect(() => {
    if (initialPrompt?.trim()) {
      setPrompt(initialPrompt.trim());
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadConsultations = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch("/api/business/consultant", { cache: "no-store" });
      const data = await res.json();
      if (res.ok && data?.ok && Array.isArray(data.consultations)) {
        setConsultations(data.consultations as BusinessConsultation[]);
      }
    } catch (err) {
      console.error("Failed to load consultant history:", err);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const handleLoadConsultation = useCallback(
    (consultation: BusinessConsultation) => {
      if (!consultation) return;
      clearTimers();
      const parsed = parseBusinessConsultantReport(consultation.response);
      setError(null);
      setHistoryNotice(null);
      setActiveConsultationId(consultation.id);
      setPrompt("");
      setAdvancedContext("");
      setAdvancedOpen(false);
      setSelectedTemplateId("custom");
      setPhase("done");
      setMessages([
        {
          id: `user-${consultation.id}`,
          role: "user",
          content: consultation.prompt,
          report: null,
          consultationId: consultation.id,
          timestamp: new Date(consultation.created_at),
        },
        {
          id: `assistant-${consultation.id}`,
          role: "assistant",
          content: parsed.rawText || consultation.response,
          report: parsed.report,
          consultationId: consultation.id,
          timestamp: new Date(consultation.updated_at),
        },
      ]);
      textareaRef.current?.focus();
    },
    [clearTimers]
  );

  const handleRunConsultation = useCallback(async () => {
    const value = prompt.trim();
    if (!value || phase === "working") return;

    setError(null);
    setHistoryNotice(null);
    setActiveConsultationId(null);
    setPrompt("");
    setStatusLineIndex(0);
    setPhase("working");

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: value,
      report: null,
      consultationId: null,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);

    statusIntervalRef.current = setInterval(() => {
      setStatusLineIndex((prev) => (prev + 1) % WORKING_STATUS_LINES.length);
    }, STATUS_ROTATE_MS);

    try {
      const res = await fetch("/api/business/consultant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: value,
          context: advancedContext.trim() || null,
          template_key: selectedTemplateId === "custom" ? null : selectedTemplateId,
          mode_hint: viewMode,
        }),
      });
      const data = await res.json();

      if (!res.ok || !data?.ok) {
        throw new Error(data?.message || data?.error || "Consultation failed");
      }

      const parsed = parseBusinessConsultantReport(data.response || "");
      const assistantMsg: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: data.response || "",
        report: (data?.report as BusinessConsultantReport | null) ?? parsed.report,
        consultationId: data?.consultation?.id ?? null,
        timestamp: new Date(),
      };

      clearTimers();
      setMessages((prev) => [...prev, assistantMsg]);
      setPhase("done");

      if (data?.saved === false) {
        setHistoryNotice(
          data?.saveWarning || "Analysis generated. History temporarily unavailable."
        );
      }

      if (data?.consultation?.id) {
        const saved = data.consultation as BusinessConsultation;
        setActiveConsultationId(saved.id);
        setConsultations((prev) => [saved, ...prev.filter((c) => c.id !== saved.id)]);
      }
    } catch (err) {
      clearTimers();
      setPrompt(value);
      setMessages((prev) => prev.filter((m) => m.id !== userMsg.id));
      setError(err instanceof Error ? err.message : "Consultation request failed");
      setPhase("idle");
    }
  }, [advancedContext, clearTimers, phase, prompt, selectedTemplateId, viewMode]);

  useEffect(() => {
    void loadConsultations();
  }, [loadConsultations]);
  useEffect(() => () => clearTimers(), [clearTimers]);

  const isWorking = phase === "working";

  // Latest report with KPIs for right sidebar
  const latestReport =
    [...messages].reverse().find((m) => m.role === "assistant" && m.report)?.report ?? null;

  // Auto-scroll to bottom of thread
  useEffect(() => {
    threadEndRef.current?.scrollIntoView({
      behavior: reducedMotion ? "auto" : "smooth",
      block: "end",
    });
  }, [messages, isWorking, reducedMotion]);

  const formatHistoryTime = (dateStr: string): string => {
    const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (seconds < 60) return "just now";
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return new Date(dateStr).toLocaleDateString();
  };

  return (
    <div className="desk relative z-10">

      {/* ── MASTHEAD ────────────────────────────────────────────────────── */}
      <header className="desk-rise flex flex-wrap items-end justify-between gap-x-6 gap-y-3 pb-4 mb-5 border-b border-[var(--biz-border)]">
        <div className="min-w-0 max-w-2xl">
          <h1 className="desk-display text-[26px] font-medium leading-[1.1] text-[var(--biz-text-strong)] sm:text-[30px]">
            Business Advisor
          </h1>
          <p className="mt-2 text-[13px] leading-relaxed text-[var(--biz-muted)]">
            Guidance for pricing, grading, inventory management,
            liquidity planning, and business decisions.
          </p>
        </div>
        <p className="hidden sm:block text-[12px] font-medium uppercase tracking-[0.14em] text-[var(--biz-muted)] pb-1">
          Pricing · Inventory · Grading · Liquidity
        </p>
      </header>

      {/* ── WORKSPACE GRID ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[200px_1fr] xl:grid-cols-[200px_1fr_220px]">

        {/* ── LEFT SIDEBAR ──────────────────────────────────────────────── */}
        <aside className="hidden lg:flex lg:col-start-1 flex-col gap-3">

          {/* Business context */}
          <div className={`${panelClass} p-3`}>
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-[var(--biz-muted)] mb-2.5">
              Business Context
            </p>
            <div className="space-y-px">
              {CONTEXT_STATS_PLACEHOLDER.map(({ label, value }) => (
                <div
                  key={label}
                  className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-white/[0.04] transition-colors"
                >
                  <span className="text-xs text-[var(--biz-muted)]">{label}</span>
                  <span className="text-xs font-medium text-[var(--biz-muted-strong)] tabular-nums">{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Recent analyses */}
          <div className={`${panelClass} p-3 flex-1`}>
            <div className="flex items-center justify-between mb-2.5">
              <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-[var(--biz-muted)]">
                Recent Analyses
              </p>
              <button
                type="button"
                onClick={() => void loadConsultations()}
                disabled={historyLoading || isWorking}
                className="text-[11px] text-[var(--biz-muted)] hover:text-[var(--biz-text)] transition disabled:opacity-50"
                title="Refresh history"
              >
                {historyLoading ? "·" : "↻"}
              </button>
            </div>
            {historyLoading ? (
              <p className="px-2 text-xs text-[var(--biz-muted)]">Loading...</p>
            ) : consultations.length > 0 ? (
              <div className="space-y-0.5">
                {consultations.slice(0, 10).map((c) => {
                  const invItems = formatContextMetric(c.context_summary, "inventoryItems");
                  const salesCount = formatContextMetric(c.context_summary, "totalSales");
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => handleLoadConsultation(c)}
                      disabled={isWorking}
                      className={`w-full rounded-[10px] px-2 py-1.5 text-left transition ${
                        c.id === activeConsultationId
                          ? "bg-white/[0.06] text-[color:var(--biz-text)]"
                          : "text-[var(--biz-muted-strong)] hover:bg-white/[0.04] hover:text-[var(--biz-text)]"
                      } disabled:cursor-not-allowed disabled:opacity-50`}
                    >
                      <p className="text-xs truncate leading-5">{c.title}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[10px] text-[var(--biz-muted)]">
                          {formatHistoryTime(c.updated_at)}
                        </span>
                        {invItems && (
                          <span className="text-[10px] text-[var(--biz-faint)]">Inv {invItems}</span>
                        )}
                        {salesCount && (
                          <span className="text-[10px] text-[var(--biz-faint)]">· {salesCount} sales</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="px-2 text-xs text-[var(--biz-muted)]">No prior analyses</p>
            )}
          </div>
        </aside>

        {/* ── CENTER PANEL — chat thread layout ─────────────────────────── */}
        <div
          className={`${glassPanelClass} flex flex-col min-w-0`}
          style={{ height: "calc(100vh - 13rem)", minHeight: "520px" }}
        >
          {/* Template chips */}
          <div className="shrink-0 flex gap-1.5 overflow-x-auto px-4 pt-3.5 pb-3 border-b border-[var(--biz-border-subtle)]">
            {TEMPLATES.map((template) => {
              const isActive = selectedTemplateId === template.id;
              return (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => {
                    setSelectedTemplateId(template.id);
                    setPrompt(template.example);
                    textareaRef.current?.focus();
                  }}
                  disabled={isWorking}
                  className={`shrink-0 rounded-full border px-3 py-1 text-[11px] font-medium transition ${
                    isActive
                      ? "border-[var(--desk-gold-line)] bg-[var(--desk-gold-soft)] text-[var(--desk-gold-bright)]"
                      : "border-[var(--biz-border)] bg-transparent text-[var(--biz-muted)] hover:text-[var(--biz-text)] hover:bg-white/[0.07]"
                  } disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  {template.label}
                </button>
              );
            })}
          </div>

          {/* Message thread */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">

            {/* Empty state */}
            {messages.length === 0 && !isWorking && (
              <div className="flex flex-col items-center justify-center h-full gap-5 text-center">
<div>
                  <p className="text-sm font-semibold text-[var(--biz-text-strong)]">
                    CardzCheck Business Advisor
                  </p>
                  <p className="mt-1.5 text-sm text-[var(--biz-muted)] max-w-xs leading-6">
                    Ask about pricing, grading, inventory, liquidity, or anything else in your card business.
                  </p>
                </div>
                <div className="flex flex-wrap justify-center gap-1.5 max-w-sm">
                  {QUICK_PROMPTS.slice(0, 4).map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => {
                        setPrompt(q);
                        textareaRef.current?.focus();
                      }}
                      className="rounded-full border border-[var(--biz-border)] bg-transparent px-3 py-1.5 text-[11px] text-[var(--biz-muted)] transition hover:text-[var(--biz-text)] hover:border-[var(--biz-border-strong)] hover:bg-white/[0.04]"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Messages */}
            {messages.map((msg) => {
              if (msg.role === "user") {
                return (
                  <div key={msg.id} className="flex justify-end">
                    <div className="max-w-[80%] rounded-2xl rounded-br-md border border-[var(--biz-primary-border)] bg-[var(--biz-primary)] px-4 py-3">
                      <p className="text-sm leading-6 text-[var(--biz-primary-foreground)]">{msg.content}</p>
                    </div>
                  </div>
                );
              }

              // Assistant message
              return (
                <div key={msg.id} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
<span className="text-xs font-medium text-[var(--biz-muted)]">Advisor</span>
                    </div>
                    {msg.content && (
                      <SpeakButton
                        text={buildSpeakableText(msg)}
                        size="sm"
                        className="bg-white/[0.06] text-[var(--biz-muted-strong)] hover:bg-white/[0.1]"
                      />
                    )}
                  </div>
                  {viewMode === "chat" ? (
                    <div className="max-w-[92%] rounded-2xl rounded-tl-md border border-[var(--biz-border)] bg-[var(--biz-surface-soft)] px-4 py-3">
                      <ConsultantChatBubble report={msg.report} rawText={msg.content} />
                    </div>
                  ) : (
                    <ConsultantReportView
                      report={msg.report}
                      rawText={msg.content}
                      forceFullReport
                    />
                  )}
                </div>
              );
            })}

            {/* Working indicator */}
            {isWorking && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
<span className="text-xs font-medium text-[var(--biz-muted)]">
                    Advisor
                  </span>
                </div>
                <div className="flex items-center gap-3 rounded-[16px] border border-[var(--biz-border)] bg-[var(--biz-surface-soft)] px-4 py-3">
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--biz-primary)] ${
                      reducedMotion ? "" : "animate-pulse motion-reduce:animate-none"
                    }`}
                    aria-hidden
                  />
                  <span className="text-sm text-[var(--biz-muted)]">
                    {WORKING_STATUS_LINES[statusLineIndex]}
                  </span>
                </div>
              </div>
            )}

            {/* Notices */}
            {historyNotice && (
              <div className="rounded-[14px] border border-[var(--biz-warning-border)] bg-[var(--biz-warning-soft)] px-4 py-2.5 text-xs text-[var(--biz-warning)]">
                {historyNotice}
              </div>
            )}
            {error && phase === "idle" && (
              <div className="rounded-[14px] border border-[var(--biz-danger-border)] bg-[var(--biz-danger-soft)] px-4 py-3 text-sm text-[var(--biz-danger)]">
                {error}
              </div>
            )}

            <div ref={threadEndRef} />
          </div>

          {/* Input area */}
          <div className="shrink-0 border-t border-[var(--biz-border-subtle)] px-3 pb-3 pt-2.5">

            {/* Constraints panel */}
            {advancedOpen && (
              <div className="rounded-[14px] border border-[var(--biz-border)] bg-[var(--biz-surface-soft)] mb-2.5 px-3 py-3">
                <label
                  htmlFor="consultant-constraints-input"
                  className="text-[10px] font-medium uppercase tracking-[0.2em] text-[var(--biz-muted)]"
                >
                  Constraints / Goals
                </label>
                <textarea
                  id="consultant-constraints-input"
                  value={advancedContext}
                  onChange={(e) => setAdvancedContext(e.target.value)}
                  rows={2}
                  disabled={isWorking}
                  placeholder="e.g. Need cash in 21 days, avoid selling grails, max 20 packages/week."
                  className="mt-2 w-full resize-none bg-transparent text-sm leading-6 text-[var(--biz-text-strong)] placeholder:text-[var(--biz-faint)] focus:outline-none disabled:opacity-70"
                />
              </div>
            )}

            <div className="rounded-[14px] border border-[var(--biz-border)] bg-[var(--biz-surface-soft)] focus-within:border-[var(--biz-border-strong)] transition-colors">
              <textarea
                ref={textareaRef}
                value={prompt}
                onChange={(e) => {
                  setActiveConsultationId(null);
                  setSelectedTemplateId("custom");
                  setPrompt(e.target.value);
                }}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                    e.preventDefault();
                    void handleRunConsultation();
                  }
                }}
                placeholder="Ask about pricing, grading, inventory, liquidity, or anything about your business..."
                rows={2}
                disabled={isWorking}
                id="consultant-prompt-input"
                aria-label="Business question"
                autoComplete="off"
                className="w-full resize-none border-0 bg-transparent px-4 pt-3 pb-2 text-sm leading-6 text-[var(--biz-text-strong)] placeholder:text-[var(--biz-faint)] focus:outline-none disabled:opacity-70"
              />
              <div className="flex items-center justify-between gap-2 px-3 pb-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <MicButton
                    onResult={(text) => {
                      setActiveConsultationId(null);
                      setSelectedTemplateId("custom");
                      setPrompt((prev) => appendSpeechTranscript(prev, text));
                      textareaRef.current?.focus();
                    }}
                    size="sm"
                    className="bg-white/[0.06] text-[var(--biz-muted-strong)] hover:bg-white/[0.1] hover:text-[var(--biz-text)]"
                  />
                  <button
                    type="button"
                    onClick={() => setAdvancedOpen((prev) => !prev)}
                    disabled={isWorking}
                    className="rounded-full border border-[var(--biz-border)] bg-transparent px-2.5 py-1 text-[11px] text-[var(--biz-muted)] transition hover:bg-white/[0.07] hover:text-[var(--biz-text)] disabled:opacity-60"
                  >
                    {advancedOpen ? "Hide" : "Constraints"}
                  </button>
                  {/* View mode toggle */}
                  <div className="flex items-center rounded-full border border-[var(--biz-border)] bg-[var(--biz-surface-soft)] p-0.5">
                    <button
                      type="button"
                      onClick={() => setViewMode("chat")}
                      className={`rounded-full px-2.5 py-0.5 text-[11px] transition ${
                        viewMode === "chat"
                          ? "bg-white/[0.1] text-[var(--biz-text)]"
                          : "text-[var(--biz-muted)] hover:text-[var(--biz-muted-strong)]"
                      }`}
                    >
                      Chat
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode("report")}
                      className={`rounded-full px-2.5 py-0.5 text-[11px] transition ${
                        viewMode === "report"
                          ? "bg-white/[0.06] text-[color:var(--biz-text)]"
                          : "text-[var(--biz-muted)] hover:text-[var(--biz-muted-strong)]"
                      }`}
                    >
                      Report
                    </button>
                  </div>
                  <span className="hidden md:inline text-[11px] text-[var(--biz-faint)]">⌘↵</span>
                </div>
                <button
                  type="button"
                  onClick={() => void handleRunConsultation()}
                  disabled={isWorking || !prompt.trim()}
                  className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[color:var(--biz-border-strong)] bg-[color:var(--biz-primary)] px-4 text-xs font-semibold text-[color:var(--biz-primary-foreground)] transition hover:bg-[color:var(--biz-primary-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isWorking ? "Working..." : "Send"}
                </button>
              </div>
            </div>

            {/* Quick prompt chips */}
            <div className="flex flex-wrap gap-1.5 mt-2">
              {QUICK_PROMPTS.slice(0, 5).map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => {
                    setActiveConsultationId(null);
                    setSelectedTemplateId("custom");
                    setPrompt(q);
                    textareaRef.current?.focus();
                  }}
                  disabled={isWorking}
                  className="rounded-full border border-[var(--biz-border)] bg-transparent px-2.5 py-1 text-[11px] text-[var(--biz-muted)] transition hover:text-[var(--biz-text)] hover:border-[var(--biz-border-strong)] hover:bg-white/[0.04] disabled:opacity-40"
                >
                  {q}
                </button>
              ))}
            </div>

            {/* Transparency disclaimer */}
            <p className="mt-2.5 text-center text-[10px] leading-4 text-[var(--biz-faint)]">
              Responses are AI-generated and may be inaccurate. Verify important
              numbers and decisions before acting.
            </p>
          </div>
        </div>

        {/* ── RIGHT SIDEBAR ─────────────────────────────────────────────── */}
        <aside className="hidden xl:flex xl:col-start-3 flex-col gap-3">

          {/* Suggested actions */}
          <div className={`${panelClass} p-3`}>
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-[var(--biz-muted)] mb-2.5">
              Suggested Actions
            </p>
            <div className="space-y-1">
              {SUGGESTED_ACTIONS.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  disabled
                  title="Coming soon"
                  className="w-full flex items-center gap-2.5 rounded-[10px] border border-[var(--biz-border)] bg-transparent px-2.5 py-2 text-left opacity-35 cursor-not-allowed"
                >
                  <span className="text-xs text-[var(--biz-muted)] w-4 text-center shrink-0">
                    {action.icon}
                  </span>
                  <span className="text-xs text-[var(--biz-muted-strong)]">{action.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Business signals — from latest report */}
          <div className={`${panelClass} p-3`}>
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-[var(--biz-muted)] mb-2.5">
              Business Signals
            </p>
            {latestReport && latestReport.kpis.length > 0 ? (
              <div className="space-y-px">
                {latestReport.kpis.slice(0, 5).map((kpi) => (
                  <div
                    key={kpi.label}
                    className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-white/[0.04] transition-colors"
                  >
                    <span className="text-xs text-[var(--biz-muted)] truncate pr-1">{kpi.label}</span>
                    <span className="text-xs font-medium text-[var(--biz-muted-strong)] tabular-nums shrink-0">
                      {kpi.value}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="px-2 text-xs text-[var(--biz-muted)]">Run an analysis to populate signals.</p>
            )}
          </div>

          {/* Session coverage */}
          {latestReport && (
            <div className={`${panelClass} p-3`}>
              <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-[var(--biz-muted)] mb-2.5">
                Session Coverage
              </p>
              <div className="space-y-px">
                <div className="flex items-center justify-between rounded-lg px-2 py-1.5">
                  <span className="text-xs text-[var(--biz-muted)]">Inventory</span>
                  <span className="text-xs font-medium text-[var(--biz-muted-strong)] tabular-nums">
                    {latestReport.data_coverage.inventory_count.toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-lg px-2 py-1.5">
                  <span className="text-xs text-[var(--biz-muted)]">Sales refs</span>
                  <span className="text-xs font-medium text-[var(--biz-muted-strong)] tabular-nums">
                    {latestReport.data_coverage.sales_count.toLocaleString()}
                  </span>
                </div>
              </div>
              {latestReport.data_coverage.missing.length > 0 && (
                <div className="mt-2 rounded-[10px] border border-[var(--biz-warning-border)] bg-[var(--biz-warning-soft)] px-2.5 py-1.5">
                  <p className="text-[10px] text-[var(--biz-warning)]">
                    Missing: {latestReport.data_coverage.missing.join(", ")}
                  </p>
                </div>
              )}
            </div>
          )}
        </aside>
      </div>

      {/* Mobile: Recent analyses */}
      <div className="mt-4 lg:hidden">
        <div className={`${panelClass} p-3`}>
          <div className="flex items-center justify-between mb-2.5">
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-[var(--biz-muted)]">
              Recent Analyses
            </p>
            <button
              type="button"
              onClick={() => void loadConsultations()}
              disabled={historyLoading || isWorking}
              className="text-[11px] text-[var(--biz-muted)] hover:text-[var(--biz-text)] transition disabled:opacity-50"
            >
              {historyLoading ? "Loading..." : "Refresh"}
            </button>
          </div>
          {consultations.length > 0 ? (
            <div className="flex gap-2.5 overflow-x-auto pb-1">
              {consultations.slice(0, 8).map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => handleLoadConsultation(c)}
                  disabled={isWorking}
                  className={`min-w-[180px] rounded-[12px] border px-3 py-2 text-left transition ${
                    c.id === activeConsultationId
                      ? "border-[var(--biz-border-strong)] bg-white/[0.06]"
                      : "border-[var(--biz-border)] bg-[var(--biz-surface-soft)] hover:bg-white/[0.07]"
                  } disabled:opacity-50`}
                >
                  <p className="text-xs font-medium text-[var(--biz-text)] truncate">{c.title}</p>
                  <p className="text-[10px] text-[var(--biz-muted)] mt-0.5">
                    {formatHistoryTime(c.updated_at)}
                  </p>
                </button>
              ))}
            </div>
          ) : !historyLoading ? (
            <p className="text-xs text-[var(--biz-muted)]">No prior analyses</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
