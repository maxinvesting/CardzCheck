"use client";

import { useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { Surface } from "@/components/ui/Surface";
import type { BusinessConsultation } from "@/types";
import type { BusinessConsultantReport } from "@/lib/business/consultant-report";
import { parseBusinessConsultantReport } from "@/lib/business/consultant-report";

const CONSULTANT_COPY = {
  title: "CardzCheck Business Consultant",
  subtitle: "Inventory Strategy • Pricing Decisions • Grading Analysis • Liquidity Planning",
  helper:
    "Uses your inventory, sales history, and comps data to support card-business decisions. Missing inputs are treated as constraints.",
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
    "Ask the Consultant… (pricing, grading submissions, inventory turnover, liquidity, risk exposure, channel strategy…)",
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
  "Reviewing inventory & sales data…",
  "Drafting action plan…",
  "Finalizing recommendations…",
  "Modeling margin structure…",
  "Analyzing channel distribution…",
];

const ACKNOWLEDGE_MS = 400;
const STEP_INTERVAL_MS = 500;
const STATUS_ROTATE_MS = 2200;

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
        <strong key={`${keyBase}-b-${i}`} className="font-semibold text-gray-100">
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
      <ul key={`ul-${key++}`} className="my-2 list-disc space-y-1 pl-5 text-gray-200">
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
        <h3 key={`h-${key++}`} className="mt-4 text-base font-semibold text-white">
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
      <p key={`p-${key++}`} className="my-2 text-gray-200">
        {renderInline(line, `p-${key}`)}
      </p>
    );
  }

  flushBullets();

  return (
    <article className="rounded-lg border border-gray-800/80 bg-gray-950/55 px-4 py-3 text-[15px] leading-7">
      {content.length > 0 ? (
        content
      ) : (
        <p className="text-sm text-gray-300">No analysis text returned.</p>
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
    <div className="rounded-md border border-gray-800 bg-gray-950/60 px-3 py-3">
      <div className="mb-3 flex items-center gap-2">
        <span
          className={`h-2 w-2 shrink-0 rounded-full bg-emerald-500 ${
            reducedMotion ? "" : "animate-pulse motion-reduce:animate-none"
          }`}
          aria-hidden
        />
        <span className="text-xs text-gray-300">{statusLine}</span>
      </div>
      <ul className="space-y-1.5" role="list" aria-label="Analysis in progress">
        {steps.map((step, i) => (
          <li
            key={step.label}
            className={`flex items-center gap-2 text-[11px] transition-opacity duration-200 ${
              step.status === "queued"
                ? "text-gray-500"
                : step.status === "working"
                  ? "text-emerald-300"
                  : "text-gray-400"
            }`}
            style={{
              transitionDelay: reducedMotion ? "0ms" : `${i * 30}ms`,
            }}
          >
            {step.status === "completed" ? (
              <span className="text-emerald-500" aria-hidden>
                ✓
              </span>
            ) : step.status === "working" ? (
              <span
                className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500 ${
                  reducedMotion ? "" : "animate-pulse motion-reduce:animate-none"
                }`}
                aria-hidden
              />
            ) : (
              <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-gray-600" aria-hidden />
            )}
            <span>{step.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function BusinessConsultantPanel() {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [prompt, setPrompt] = useState(""); // synced from DOM for button state; suggestion clicks also set this
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
  const reducedMotion = useReducedMotion();

  const steps: { label: string; status: StepStatus }[] = CONSULTANT_STEPS.map((label, i) => {
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
      setError(null);
      setHistoryNotice(null);
      setActiveConsultationId(consultation.id);
      setPrompt(consultation.prompt);
      setResponse(consultation.response);
      setStepIndex(CONSULTANT_STEPS.length);
      setStatusLineIndex(0);
      setPhase("deliverable");
      if (textareaRef.current) {
        textareaRef.current.value = consultation.prompt;
      }
    },
    [clearTimers]
  );

  const handleRunConsultation = async () => {
    const value = textareaRef.current?.value?.trim() ?? prompt.trim();
    if (!value || (phase !== "idle" && phase !== "deliverable")) return;

    setError(null);
    setHistoryNotice(null);
    setResponse("");
    setPrompt(value);
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
        body: JSON.stringify({ prompt: value }),
      });
      const data = await res.json();

      if (!res.ok || !data?.ok) {
        throw new Error(data?.message || data?.error || "Consultation failed");
      }

      clearTimers();
      setStepIndex(CONSULTANT_STEPS.length);
      setResponse(data.response || "");
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
      setError(err instanceof Error ? err.message : "Consultation request failed");
      setPhase("idle");
    }
  };

  useEffect(() => {
    void loadConsultations();
  }, [loadConsultations]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  const isWorking = phase === "acknowledge" || phase === "working";
  const formatHistoryTime = (dateStr: string): string => {
    const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (seconds < 60) return "just now";
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return new Date(dateStr).toLocaleDateString();
  };

  return (
    <section className="relative z-20 mt-3 rounded-lg border border-gray-800 bg-gray-900/80">
      <div className="border-b border-gray-800 px-3 py-2">
        <div>
          <h2 className="text-sm font-semibold text-white">{CONSULTANT_COPY.title}</h2>
          <p className="text-xs text-gray-400">{CONSULTANT_COPY.subtitle}</p>
        </div>
      </div>

      <div className="space-y-2 p-3">
        <div className="text-[11px] text-gray-500">{CONSULTANT_COPY.helper}</div>

        <div className="flex flex-wrap gap-1.5">
          {CONSULTANT_COPY.promptSuggestions.map((suggestion) => (
            <button
              key={suggestion}
              onClick={() => {
                setActiveConsultationId(null);
                setPrompt(suggestion);
                if (textareaRef.current) textareaRef.current.value = suggestion;
              }}
              disabled={isWorking}
              className="rounded border border-gray-800 bg-gray-950/50 px-2 py-1 text-[10px] text-gray-300 transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {suggestion}
            </button>
          ))}
        </div>

        <div className="rounded-md border border-gray-800 bg-gray-950/40 px-2.5 py-2">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-[11px] font-medium text-gray-300">Saved Consultations</p>
            <button
              type="button"
              onClick={() => void loadConsultations()}
              disabled={historyLoading || isWorking}
              className="rounded border border-gray-700 px-1.5 py-0.5 text-[10px] text-gray-300 hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {historyLoading ? "Loading..." : "Refresh"}
            </button>
          </div>

          {historyLoading ? (
            <p className="text-[11px] text-gray-500">Loading saved consultations...</p>
          ) : consultations.length === 0 ? (
            <p className="text-[11px] text-gray-500">
              No saved consultations yet. Your completed analyses will appear here.
            </p>
          ) : (
            <div className="max-h-36 space-y-1 overflow-y-auto pr-1">
              {consultations.map((consultation) => (
                <button
                  key={consultation.id}
                  type="button"
                  onClick={() => handleLoadConsultation(consultation)}
                  disabled={isWorking}
                  className={`w-full rounded border px-2 py-1.5 text-left transition-colors ${
                    consultation.id === activeConsultationId
                      ? "border-emerald-700/60 bg-emerald-900/20"
                      : "border-gray-800 bg-gray-950/40 hover:bg-gray-900"
                  } disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  <p className="truncate text-xs text-gray-200">{consultation.title}</p>
                  <p className="mt-0.5 text-[10px] text-gray-500">
                    {formatHistoryTime(consultation.updated_at)}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>

        {historyNotice && (
          <div className="rounded-md border border-amber-700/40 bg-amber-950/20 px-2.5 py-2 text-xs text-amber-200">
            {historyNotice}
          </div>
        )}

        <textarea
          ref={textareaRef}
          defaultValue=""
          onChange={(e) => {
            setActiveConsultationId(null);
            setPrompt(e.target.value);
          }}
          placeholder={CONSULTANT_COPY.placeholder}
          rows={4}
          disabled={isWorking}
          id="consultant-prompt-input"
          aria-label="Business decision prompt"
          autoComplete="off"
          className="relative z-20 w-full rounded-md border border-gray-800 bg-gray-950 px-2.5 py-2 text-sm text-gray-100 placeholder:text-gray-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-70 disabled:cursor-not-allowed"
        />

        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] text-gray-500">
            Consultant output is structured for decision-making, not conversation.
          </p>
          <button
            onClick={handleRunConsultation}
            disabled={isWorking || !prompt.trim()}
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {phase === "acknowledge"
              ? "Analyzing…"
              : phase === "working"
                ? "Working…"
                : CONSULTANT_COPY.submitButton}
          </button>
        </div>

        {phase === "acknowledge" && (
          <p className="text-xs text-gray-400">
            Got it — analyzing your business data…
          </p>
        )}

        {phase === "working" && (
          <ConsultantWorkingPanel
            steps={steps}
            statusLine={WORKING_STATUS_LINES[statusLineIndex]}
            reducedMotion={reducedMotion}
          />
        )}

        {error && (
          <div className="rounded-md border border-red-800 bg-red-950/30 px-2.5 py-2 text-xs text-red-300">
            {error}
          </div>
        )}

        {phase === "deliverable" && response.trim().length > 0 && <ConsultantResponse text={response} />}
      </div>
    </section>
  );
}
