"use client";

import { useState, useEffect, useCallback, useRef } from "react";

const PROMPT_SUGGESTIONS = [
  "Build a 30-day plan to reduce unlisted inventory and improve cash flow.",
  "Identify margin compression risks and recommend pricing/fee actions.",
  "Provide channel optimization recommendations based on my current distribution.",
];

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

function parseResponseIntoSections(text: string): { title: string; body: string }[] {
  const separator = /-{5,}\s*\n/g;
  const parts = text.split(separator).map((p) => p.trim()).filter(Boolean);

  if (parts.length === 0 && text.trim()) {
    return [{ title: "Consulting Output", body: text.trim() }];
  }

  const sections: { title: string; body: string }[] = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const lines = part.split("\n");
    const firstLine = lines[0]?.trim() ?? "";
    const looksLikeHeader =
      firstLine === firstLine.toUpperCase() &&
      firstLine.length > 2 &&
      !firstLine.includes(":") &&
      lines.length >= 1;

    if (looksLikeHeader && lines.length === 1) {
      const next = parts[i + 1];
      sections.push({ title: firstLine, body: next ?? "" });
      if (next) i++;
    } else if (looksLikeHeader) {
      sections.push({ title: firstLine, body: lines.slice(1).join("\n").trim() });
    } else if (sections.length === 0) {
      sections.push({ title: "Executive Summary", body: part });
    } else {
      const last = sections[sections.length - 1];
      last.body = last.body ? `${last.body}\n\n${part}` : part;
    }
  }

  if (sections.length === 0 && text.trim()) {
    return [{ title: "Consulting Output", body: text.trim() }];
  }
  return sections;
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

function DeliverableOutput({
  sections,
  reducedMotion,
}: {
  sections: { title: string; body: string }[];
  reducedMotion: boolean;
}) {
  return (
    <div className="space-y-3">
      {sections.map((section, i) => (
        <div
          key={section.title + i}
          className={`rounded-md border border-gray-800 bg-gray-950/40 px-2.5 py-2 ${
            reducedMotion ? "" : "animate-fade-slide-in motion-reduce:animate-none"
          }`}
          style={
            reducedMotion
              ? {}
              : {
                  animationDelay: `${i * 80}ms`,
                  animationFillMode: "both",
                }
          }
        >
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
            {section.title}
          </p>
          <pre className="whitespace-pre-wrap text-xs text-gray-200">{section.body}</pre>
        </div>
      ))}
    </div>
  );
}

export default function BusinessConsultantPanel() {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [prompt, setPrompt] = useState(""); // synced from DOM for button state; suggestion clicks also set this
  const [response, setResponse] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
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

  const handleRunConsultation = async () => {
    const value = textareaRef.current?.value?.trim() ?? prompt.trim();
    if (!value || (phase !== "idle" && phase !== "deliverable")) return;

    setError(null);
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
    } catch (err) {
      clearTimers();
      setError(err instanceof Error ? err.message : "Consultation request failed");
      setPhase("idle");
    }
  };

  useEffect(() => () => clearTimers(), [clearTimers]);

  const isWorking = phase === "acknowledge" || phase === "working";
  const sections = response ? parseResponseIntoSections(response) : [];

  return (
    <section className="relative z-20 mt-3 rounded-lg border border-gray-800 bg-gray-900/80">
      <div className="flex flex-col gap-2 border-b border-gray-800 px-3 py-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-white">CardzCheck Business Consultant</h2>
          <p className="text-xs text-gray-400">
            Strategic Planning &amp; Business Optimization (Business Only)
          </p>
        </div>
        <span className="rounded border border-emerald-700/60 bg-emerald-900/30 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-emerald-300">
          AI
        </span>
      </div>

      <div className="space-y-2 p-3">
        <div className="text-[11px] text-gray-500">
          Uses your inventory and sales data only. Missing inputs are surfaced as constraints.
        </div>

        <div className="flex flex-wrap gap-1.5">
          {PROMPT_SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              onClick={() => {
                setPrompt(suggestion);
                if (textareaRef.current) textareaRef.current.value = suggestion;
              }}
              disabled={isWorking}
              className="rounded border border-gray-800 bg-gray-950/50 px-2 py-1 text-[11px] text-gray-300 transition-colors hover:bg-gray-800 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {suggestion}
            </button>
          ))}
        </div>

        <textarea
          ref={textareaRef}
          defaultValue=""
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe the business decision you need help with (pricing strategy, liquidation plan, expense discipline, channel mix, etc.)"
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
                : "Generate Consulting Analysis"}
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

        {phase === "deliverable" && sections.length > 0 && (
          <DeliverableOutput sections={sections} reducedMotion={reducedMotion} />
        )}
      </div>
    </section>
  );
}
