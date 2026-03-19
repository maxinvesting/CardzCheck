"use client";

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react";
import { MicButton } from "@/components/ui/MicButton";
import { SpeakButton } from "@/components/ui/SpeakButton";
import type { BusinessConsultation } from "@/types";
import type { BusinessConsultantReport } from "@/lib/business/consultant-report";
import { parseBusinessConsultantReport } from "@/lib/business/consultant-report";

const CONSULTANT_COPY = {
  eyebrow: "Business Consultant Agent",
  title: "Operator-mode guidance for pricing, grading, and liquidity.",
  subtitle:
    "Ask a business question, review the operator memo above, and keep the composer anchored below like a proper agent workspace.",
  helper:
    "Uses your inventory, sales history, and estimate data to support card-business decisions. Missing inputs are treated as constraints.",
  promptSuggestions: [
    "Build a 30-day plan to liquidate slow-moving inventory",
    "Identify dead capital in my inventory",
    "Which cards should I discount vs hold?",
    "Analyze margin compression risks and pricing actions",
    "Recommend pricing for faster sell-through",
    "Which raw cards should I submit for grading?",
    "Analyze grading ROI vs selling raw",
    "Which cards should be auction vs Buy It Now?",
    "Optimize my channel mix (eBay, shows, Whatnot)",
  ],
  placeholder:
    "Ask the Consultant... (pricing, grading submissions, inventory turnover, liquidity, risk exposure, channel strategy...)",
  submitButton: "Generate Analysis",
} as const;

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

const CAPABILITY_PILLS = ["Pricing", "Inventory", "Grading", "Liquidity"] as const;

type TemplateId = (typeof TEMPLATES)[number]["id"] | "custom";
type Phase = "idle" | "acknowledge" | "working" | "deliverable";
type StepStatus = "queued" | "working" | "completed";

const CONSULTANT_STEPS = [
  "Checking listing coverage",
  "Estimating margin structure",
  "Flagging inventory risks",
  "Reviewing channel mix",
  "Drafting 30-day action plan",
  "Drafting accounting actions",
];

const WORKING_STATUS_LINES = [
  "Reviewing inventory and sales data...",
  "Drafting action plan...",
  "Finalizing recommendations...",
  "Modeling margin structure...",
  "Analyzing channel distribution...",
];

const ACKNOWLEDGE_MS = 400;
const STEP_INTERVAL_MS = 500;
const STATUS_ROTATE_MS = 2200;

const CONSULTANT_THEME_STYLE: CSSProperties = {
  ["--biz-text" as string]: "#f4f7fb",
  ["--biz-muted" as string]: "rgba(226, 232, 240, 0.68)",
  ["--biz-border" as string]: "rgba(148, 163, 184, 0.16)",
  ["--biz-primary" as string]: "#63e6be",
  ["--biz-warning" as string]: "#fbbf24",
  ["--biz-surface" as string]: "rgba(255, 255, 255, 0.04)",
  ["--biz-surface-soft" as string]: "rgba(15, 23, 42, 0.72)",
  ["--surface" as string]: "rgba(255, 255, 255, 0.04)",
};

const glassPanelClass =
  "rounded-[24px] border border-white/10 bg-gradient-to-br from-white/[0.06] via-white/[0.04] to-white/[0.02] shadow-[0_24px_90px_rgba(0,0,0,0.42)] backdrop-blur-xl";

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
    const formatted = value.toLocaleString(undefined, {
      maximumFractionDigits: suffix ? 1 : 0,
    });
    return `${formatted}${suffix}`;
  }

  if (typeof value === "string" && value.trim()) {
    return `${value}${suffix}`;
  }

  return null;
}

function buildSpeakableResponse(
  report: BusinessConsultantReport | null,
  rawText: string
): string {
  if (!report) return rawText;

  const parts = [
    report.report_title,
    ...report.kpis.slice(0, 4).map((kpi) => `${kpi.label}: ${kpi.value}`),
    ...report.recommended_actions
      .slice(0, 3)
      .map((action) => (action.impact ? `${action.action}. ${action.impact}` : action.action)),
    ...report.notes.slice(0, 3),
  ]
    .map((part) => part.trim())
    .filter(Boolean);

  return parts.join(". ");
}

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
      const heading = formatHeading(line);
      content.push(
        <h3 key={`h-${key++}`} className="mt-5 text-base font-semibold tracking-tight text-white">
          {heading}
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
    <article className="rounded-[24px] border border-white/10 bg-white/[0.03] px-5 py-4">
      {content.length > 0 ? (
        content
      ) : (
        <p className="text-sm text-[var(--biz-muted)]">No analysis text returned.</p>
      )}
    </article>
  );
}

function ConsultantWorkingPanel({
  steps,
  statusLine,
  reducedMotion,
}: {
  steps: { label: string; status: StepStatus }[];
  statusLine: string;
  reducedMotion: boolean;
}) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-white/[0.03] px-4 py-4">
      <div className="mb-4 flex items-center gap-2">
        <span
          className={`h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--biz-primary)] ${
            reducedMotion ? "" : "animate-pulse motion-reduce:animate-none"
          }`}
          aria-hidden
        />
        <span className="text-sm text-[var(--biz-muted)]">{statusLine}</span>
      </div>
      <ul className="space-y-2" role="list" aria-label="Analysis in progress">
        {steps.map((step, i) => (
          <li
            key={step.label}
            className={`flex items-center gap-2.5 text-xs transition-opacity duration-200 ${
              step.status === "queued"
                ? "text-[var(--biz-muted)]"
                : step.status === "working"
                  ? "text-[var(--biz-primary)]"
                  : "text-[var(--biz-muted)]"
            }`}
            style={{
              transitionDelay: reducedMotion ? "0ms" : `${i * 30}ms`,
            }}
          >
            {step.status === "completed" ? (
              <span className="text-[var(--biz-primary)]" aria-hidden>
                ✓
              </span>
            ) : step.status === "working" ? (
              <span
                className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--biz-primary)] ${
                  reducedMotion ? "" : "animate-pulse motion-reduce:animate-none"
                }`}
                aria-hidden
              />
            ) : (
              <span
                className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-white/20"
                aria-hidden
              />
            )}
            <span>{step.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ConsultantReportView({
  report,
  rawText,
}: {
  report: BusinessConsultantReport | null;
  rawText: string;
}) {
  const trimmed = rawText.trim();

  if (!report && !trimmed) {
    return (
      <div className="rounded-[24px] border border-dashed border-white/10 bg-white/[0.02] px-5 py-10 text-center">
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

  const hasHighRisk = report.high_risk_positions.length > 0;
  const hasActions = report.recommended_actions.length > 0;
  const hasNotes = report.notes.length > 0;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold tracking-tight text-[var(--biz-text)]">
            {report.report_title || "Business Consultant Report"}
          </h3>
          <p className="mt-1 text-sm text-[var(--biz-muted)]">
            {formatReportTimestamp(report.timestamp)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-[11px]">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[var(--biz-muted)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--biz-primary)]" />
            Inventory {report.data_coverage.inventory_count.toLocaleString()}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[var(--biz-muted)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--biz-primary)]" />
            Sales {report.data_coverage.sales_count.toLocaleString()}
          </span>
          {report.data_coverage.missing.length > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1 text-amber-100">
              Missing: {report.data_coverage.missing.join(", ")}
            </span>
          )}
        </div>
      </header>

      {report.kpis.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {report.kpis.map((kpi) => (
            <div
              key={kpi.label}
              className="rounded-[22px] border border-white/10 bg-white/[0.03] px-4 py-3"
            >
              <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--biz-muted)]">
                {kpi.label}
              </p>
              <p className="mt-2 text-lg font-semibold tracking-tight text-[var(--biz-text)]">
                {kpi.value}
              </p>
              {kpi.hint && (
                <p className="mt-1 text-xs leading-5 text-[var(--biz-muted)]">{kpi.hint}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {hasHighRisk && (
        <section className="space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--biz-muted)]">
            High-Risk Positions
          </h4>
          <div className="overflow-hidden rounded-[24px] border border-white/10 bg-slate-950/40">
            <div className="grid grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.9fr)] gap-x-3 border-b border-white/10 px-4 py-2 text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--biz-muted)]">
              <span>Item</span>
              <span className="text-right">Cost Basis</span>
              <span className="text-right">CMV</span>
              <span className="text-right">Delta</span>
            </div>
            <div className="divide-y divide-white/10 text-sm">
              {report.high_risk_positions.map((pos) => (
                <div
                  key={`${pos.item}-${pos.reason}`}
                  className="grid grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.9fr)] gap-x-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[var(--biz-text)]">{pos.item}</p>
                    {pos.reason && (
                      <p className="mt-1 text-xs leading-5 text-[var(--biz-muted)]">{pos.reason}</p>
                    )}
                  </div>
                  <div className="text-right tabular-nums text-[var(--biz-text)]">
                    {pos.cost_basis.toLocaleString(undefined, {
                      maximumFractionDigits: 0,
                    })}
                  </div>
                  <div className="text-right tabular-nums text-[var(--biz-text)]">
                    {pos.cmv.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </div>
                  <div className="text-right tabular-nums text-amber-200">
                    {pos.delta_pct.toFixed(1)}%
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {hasActions && (
        <section className="space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--biz-muted)]">
            Recommended Actions
          </h4>
          <ul className="space-y-2.5 text-sm leading-7 text-[var(--biz-text)]">
            {report.recommended_actions.map((act, idx) => (
              <li
                key={`${act.action}-${idx}`}
                className="rounded-[22px] border border-white/10 bg-white/[0.03] px-4 py-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-[var(--biz-text)]">{act.action}</p>
                    {act.impact && (
                      <p className="mt-1 text-sm leading-6 text-[var(--biz-muted)]">{act.impact}</p>
                    )}
                  </div>
                  <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-[var(--biz-muted)]">
                    {act.effort}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {hasNotes && (
        <section className="space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--biz-muted)]">
            Notes
          </h4>
          <ul className="space-y-2.5 text-sm leading-7 text-[var(--biz-text)]">
            {report.notes.map((note, idx) => (
              <li
                key={idx}
                className="rounded-[22px] border border-white/10 bg-white/[0.03] px-4 py-3"
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

export default function BusinessConsultantPanel() {
  const [prompt, setPrompt] = useState("");
  const [submittedPrompt, setSubmittedPrompt] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<TemplateId>("custom");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [advancedContext, setAdvancedContext] = useState("");
  const [report, setReport] = useState<BusinessConsultantReport | null>(null);
  const [response, setResponse] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [historyNotice, setHistoryNotice] = useState<string | null>(null);
  const [consultations, setConsultations] = useState<BusinessConsultation[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [activeConsultationId, setActiveConsultationId] = useState<string | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [statusLineIndex, setStatusLineIndex] = useState(0);
  const stepIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const statusIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const acknowledgeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);
  const reducedMotion = useReducedMotion();

  const steps: { label: string; status: StepStatus }[] = CONSULTANT_STEPS.map((label, i) => {
    if (phase === "acknowledge") return { label, status: "queued" as StepStatus };
    if (i < stepIndex) return { label, status: "completed" as StepStatus };
    if (i === stepIndex && phase === "working") return { label, status: "working" as StepStatus };
    return { label, status: "queued" as StepStatus };
  });

  const clearTimers = useCallback(() => {
    if (stepIntervalRef.current) {
      clearInterval(stepIntervalRef.current);
      stepIntervalRef.current = null;
    }
    if (statusIntervalRef.current) {
      clearInterval(statusIntervalRef.current);
      statusIntervalRef.current = null;
    }
    if (acknowledgeTimeoutRef.current) {
      clearTimeout(acknowledgeTimeoutRef.current);
      acknowledgeTimeoutRef.current = null;
    }
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
      setSubmittedPrompt(consultation.prompt);
      setPrompt("");
      setAdvancedContext("");
      setAdvancedOpen(false);
      setSelectedTemplateId("custom");
      setReport(parsed.report);
      setResponse(parsed.rawText || consultation.response);
      setStepIndex(CONSULTANT_STEPS.length);
      setStatusLineIndex(0);
      setPhase("deliverable");
      textareaRef.current?.focus();
    },
    [clearTimers]
  );

  const handleRunConsultation = useCallback(async () => {
    const value = prompt.trim();
    if (!value || (phase !== "idle" && phase !== "deliverable")) return;

    setError(null);
    setHistoryNotice(null);
    setActiveConsultationId(null);
    setSubmittedPrompt(value);
    setPrompt("");
    setResponse("");
    setReport(null);
    setStepIndex(0);
    setStatusLineIndex(0);
    setPhase("acknowledge");

    acknowledgeTimeoutRef.current = setTimeout(() => {
      setPhase("working");
      acknowledgeTimeoutRef.current = null;
    }, ACKNOWLEDGE_MS);

    stepIntervalRef.current = setInterval(() => {
      setStepIndex((prev) => {
        if (prev >= CONSULTANT_STEPS.length - 1) {
          if (stepIntervalRef.current) {
            clearInterval(stepIntervalRef.current);
            stepIntervalRef.current = null;
          }
          return prev;
        }
        return prev + 1;
      });
    }, STEP_INTERVAL_MS);

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
        }),
      });
      const data = await res.json();

      if (!res.ok || !data?.ok) {
        throw new Error(data?.message || data?.error || "Consultation failed");
      }

      const parsed = parseBusinessConsultantReport(data.response || "");

      clearTimers();
      setStepIndex(CONSULTANT_STEPS.length);
      setResponse(data.response || "");
      setReport((data?.report as BusinessConsultantReport | null) ?? parsed.report);
      setPhase("deliverable");

      if (data?.saved === false) {
        setHistoryNotice(
          data?.saveWarning || "Analysis generated. History is temporarily unavailable for this run."
        );
      } else {
        setHistoryNotice(null);
      }

      if (data?.consultation?.id) {
        const savedConsultation = data.consultation as BusinessConsultation;
        setActiveConsultationId(savedConsultation.id);
        setConsultations((prev) => [
          savedConsultation,
          ...prev.filter((item) => item.id !== savedConsultation.id),
        ]);
      }
    } catch (err) {
      clearTimers();
      setPrompt(value);
      setReport(null);
      setError(err instanceof Error ? err.message : "Consultation request failed");
      setPhase("idle");
    }
  }, [advancedContext, clearTimers, phase, prompt, selectedTemplateId]);

  useEffect(() => {
    void loadConsultations();
  }, [loadConsultations]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  const isWorking = phase === "acknowledge" || phase === "working";
  const hasTranscript = Boolean(submittedPrompt || response.trim() || error || isWorking || report);
  const isIdleState = !hasTranscript;
  const statusLine =
    phase === "acknowledge"
      ? "Checking your inventory and sales context..."
      : WORKING_STATUS_LINES[statusLineIndex];
  const speakableResponse = buildSpeakableResponse(report, response);

  useEffect(() => {
    if (!hasTranscript) return;
    transcriptEndRef.current?.scrollIntoView({
      behavior: reducedMotion ? "auto" : "smooth",
      block: "end",
    });
  }, [error, hasTranscript, historyNotice, reducedMotion, report, response, submittedPrompt, phase]);

  const formatHistoryTime = (dateStr: string): string => {
    const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (seconds < 60) return "just now";
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return new Date(dateStr).toLocaleDateString();
  };

  return (
    <section
      className={`relative z-10 flex flex-col ${
        isIdleState
          ? "min-h-[calc(100vh-7rem)] pb-4 lg:min-h-[calc(100vh-4.6rem)]"
          : "min-h-[calc(100vh-8rem)] pb-8 lg:min-h-[calc(100vh-5rem)]"
      }`}
      style={CONSULTANT_THEME_STYLE}
    >
      <header
        className={`mx-auto w-full max-w-5xl ${
          isIdleState ? "pt-1 md:pt-3" : "pt-2 md:pt-6"
        }`}
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-medium uppercase tracking-[0.2em] text-slate-300">
              {CONSULTANT_COPY.eyebrow}
            </span>
            <h1
              className={`font-semibold tracking-[-0.04em] text-white ${
                isIdleState ? "mt-3 text-[2rem] sm:text-[2.6rem]" : "mt-4 text-3xl sm:text-4xl"
              }`}
            >
              {CONSULTANT_COPY.title}
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-400">{CONSULTANT_COPY.subtitle}</p>
          </div>

          <div className="flex flex-wrap gap-2">
            {CAPABILITY_PILLS.map((pill) => (
              <span
                key={pill}
                className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-slate-300"
              >
                {pill}
              </span>
            ))}
          </div>
        </div>
      </header>

      <div className={`mx-auto w-full max-w-5xl space-y-3 ${isIdleState ? "mt-3" : "mt-5"}`}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-slate-500">
              Recent analyses
            </p>
            <p className="mt-1 text-sm leading-6 text-slate-400">
              Reload any prior pricing or liquidity readout without leaving the thread.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadConsultations()}
            disabled={historyLoading || isWorking}
            className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px] font-medium text-slate-300 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {historyLoading ? "Loading..." : "Refresh"}
          </button>
        </div>

        {historyLoading ? (
          <div className="rounded-[22px] border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-500">
            Loading saved consultations...
          </div>
        ) : consultations.length > 0 ? (
          <div className="flex gap-3 overflow-x-auto pb-1">
            {consultations.map((consultation) => {
              const inventoryItems = formatContextMetric(
                consultation.context_summary,
                "inventoryItems"
              );
              const totalSales = formatContextMetric(consultation.context_summary, "totalSales");
              const coverage = formatContextMetric(
                consultation.context_summary,
                "cmvCoveragePct",
                "%"
              );

              return (
                <button
                  key={consultation.id}
                  type="button"
                  onClick={() => handleLoadConsultation(consultation)}
                  disabled={isWorking}
                  className={`min-w-[230px] rounded-[20px] border px-3.5 py-2.5 text-left transition ${
                    consultation.id === activeConsultationId
                      ? "border-emerald-300/25 bg-emerald-300/10"
                      : "border-white/10 bg-white/[0.03] hover:bg-white/[0.07]"
                  } disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  <p className="truncate text-sm font-medium text-slate-100">{consultation.title}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                    <span>{formatHistoryTime(consultation.updated_at)}</span>
                    {inventoryItems && (
                      <span className="rounded-full border border-white/10 px-2 py-0.5 text-slate-400">
                        Inv {inventoryItems}
                      </span>
                    )}
                    {totalSales && (
                      <span className="rounded-full border border-white/10 px-2 py-0.5 text-slate-400">
                        Sales {totalSales}
                      </span>
                    )}
                    {coverage && (
                      <span className="rounded-full border border-white/10 px-2 py-0.5 text-slate-400">
                        CMV {coverage}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      <div
        className={`mx-auto w-full max-w-4xl flex-1 ${
          isIdleState ? "mt-4 pb-24 lg:pb-20" : "mt-6 pb-32 lg:pb-28"
        }`}
      >
        {hasTranscript ? (
          <div className="space-y-5">
            {submittedPrompt && (
              <div className="ml-auto max-w-3xl rounded-[28px] border border-emerald-300/20 bg-emerald-300/10 px-5 py-4">
                <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-emerald-100/80">
                  You asked
                </p>
                <p className="mt-2 text-sm leading-7 text-emerald-50">{submittedPrompt}</p>
              </div>
            )}

            {historyNotice && (
              <div className="max-w-3xl rounded-[24px] border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
                {historyNotice}
              </div>
            )}

            <div className={`${glassPanelClass} max-w-4xl p-5 sm:p-6`}>
              <div className="mb-5 flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full border border-emerald-300/20 bg-emerald-300/10 text-sm font-semibold text-emerald-100">
                    BC
                  </div>
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-slate-500">
                      Consultant
                    </p>
                    <h2 className="mt-1 text-base font-semibold text-white">
                      Business operator readout
                    </h2>
                  </div>
                </div>

                {response.trim().length > 0 && (
                  <SpeakButton
                    text={speakableResponse}
                    size="sm"
                    className="bg-white/[0.06] text-slate-200 hover:bg-white/[0.1]"
                  />
                )}
              </div>

              {error ? (
                <div className="rounded-[20px] border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-100">
                  {error}
                </div>
              ) : isWorking ? (
                <ConsultantWorkingPanel
                  steps={steps}
                  statusLine={statusLine}
                  reducedMotion={reducedMotion}
                />
              ) : (
                <ConsultantReportView report={report} rawText={response} />
              )}
            </div>
          </div>
        ) : (
          <div className="flex min-h-[28vh] flex-col items-center justify-center text-center md:min-h-[26vh]">
            <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-medium uppercase tracking-[0.2em] text-slate-300">
              Start Here
            </span>
            <h2 className="mt-4 text-2xl font-semibold tracking-[-0.04em] text-white sm:text-[2rem]">
              Ask a business question and let the agent write the operator memo.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
              {CONSULTANT_COPY.helper}
            </p>

            <div className="mt-5 grid w-full max-w-4xl gap-2.5 md:grid-cols-2">
              {TEMPLATES.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => {
                    setSelectedTemplateId(template.id);
                    setPrompt(template.example);
                    textareaRef.current?.focus();
                  }}
                  className="rounded-[20px] border border-white/10 bg-white/[0.03] px-4 py-3.5 text-left transition hover:bg-white/[0.07]"
                >
                  <p className="text-sm font-semibold text-white">{template.label}</p>
                  <p className="mt-1.5 text-sm leading-6 text-slate-400">{template.example}</p>
                </button>
              ))}
            </div>
          </div>
        )}
        <div ref={transcriptEndRef} />
      </div>

      <div className={`sticky z-20 mt-auto ${isIdleState ? "bottom-20 pt-3 lg:bottom-4" : "bottom-24 pt-4 lg:bottom-6"}`}>
        <div className={`${glassPanelClass} mx-auto w-full max-w-4xl p-3 sm:p-4`}>
          <div className="mb-2.5 flex gap-2 overflow-x-auto pb-1">
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
                  className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium transition ${
                    isActive
                      ? "border-emerald-300/30 bg-emerald-300/12 text-emerald-100"
                      : "border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.08]"
                  } disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  {template.label}
                </button>
              );
            })}
          </div>

          <div className="rounded-[20px] border border-white/10 bg-[#040812]/80 backdrop-blur-md">
            {advancedOpen && (
              <div className="border-b border-white/10 px-4 py-3.5">
                <label
                  htmlFor="consultant-constraints-input"
                  className="text-[11px] font-medium uppercase tracking-[0.2em] text-slate-400"
                >
                  Constraints / goals
                </label>
                <textarea
                  id="consultant-constraints-input"
                  value={advancedContext}
                  onChange={(e) => setAdvancedContext(e.target.value)}
                  rows={3}
                  disabled={isWorking}
                  placeholder="Example: Need cash in 21 days, avoid selling grails, target max 20 packages per week."
                  className="mt-2.5 w-full resize-none rounded-[18px] border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm leading-6 text-slate-100 placeholder:text-slate-500 focus:border-white/20 focus:outline-none disabled:cursor-not-allowed disabled:opacity-70"
                />
              </div>
            )}

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
              placeholder={CONSULTANT_COPY.placeholder}
              rows={3}
              disabled={isWorking}
              id="consultant-prompt-input"
              aria-label="Business decision prompt"
              autoComplete="off"
              className="min-h-[110px] w-full resize-none border-0 bg-transparent px-4 py-4 text-[15px] leading-6 text-slate-100 placeholder:text-slate-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-70"
            />

            <div className="flex flex-col gap-3 border-t border-white/10 px-4 py-3.5 md:flex-row md:items-end md:justify-between">
              <div className="flex flex-wrap items-center gap-3">
                <MicButton
                  onResult={(text) => {
                    setActiveConsultationId(null);
                    setSelectedTemplateId("custom");
                    setPrompt(text);
                    textareaRef.current?.focus();
                  }}
                  size="sm"
                  className="bg-white/[0.06] text-slate-200 hover:bg-white/[0.1]"
                />
                <button
                  type="button"
                  onClick={() => setAdvancedOpen((prev) => !prev)}
                  disabled={isWorking}
                  className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {advancedOpen ? "Hide constraints" : "Add constraints"}
                </button>
                <p className="hidden text-xs leading-6 text-slate-500 lg:block">
                  Cleaner agent layout, same structured memo. Press Cmd/Ctrl + Enter to run.
                </p>
              </div>

              <button
                type="button"
                onClick={() => void handleRunConsultation()}
                disabled={isWorking || !prompt.trim()}
                className="inline-flex min-h-[44px] items-center justify-center rounded-full bg-emerald-400 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {phase === "acknowledge"
                  ? "Analyzing..."
                  : phase === "working"
                    ? "Working..."
                    : CONSULTANT_COPY.submitButton}
              </button>
            </div>
          </div>

          <div className="mt-2.5 flex flex-wrap gap-2">
            {CONSULTANT_COPY.promptSuggestions.slice(0, isIdleState ? 3 : 5).map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => {
                  setActiveConsultationId(null);
                  setSelectedTemplateId("custom");
                  setPrompt(suggestion);
                  textareaRef.current?.focus();
                }}
                disabled={isWorking}
                className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-slate-300 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
