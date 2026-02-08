"use client";

import type {
  GradeEstimateJobStatus,
  GradeEstimateJobSteps,
} from "@/lib/grading/gradeEstimateJob";

type ProgressPanelProps = {
  status: GradeEstimateJobStatus;
  steps: GradeEstimateJobSteps;
  identityLabel?: string | null;
  errorMessage?: string | null;
  elapsedLabel?: string | null;
};

const STEP_LABELS: Array<{
  key: keyof GradeEstimateJobSteps;
  label: string;
}> = [
  { key: "ocr_identity", label: "Extracting card identity (OCR)" },
  { key: "grade_model", label: "Analyzing condition" },
  { key: "parse_validate", label: "Building grade probabilities" },
  { key: "post_grading_value", label: "Market analysis (optional)" },
];

function formatDuration(ms?: number): string | null {
  if (!ms || ms <= 0) return null;
  return `${ms}ms`;
}

function StatusIcon({ status }: { status: string }) {
  if (status === "running") {
    return (
      <svg className="animate-spin h-4 w-4 text-blue-300" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
    );
  }
  if (status === "done") {
    return (
      <svg className="h-4 w-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
    );
  }
  if (status === "error") {
    return (
      <svg className="h-4 w-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    );
  }
  if (status === "skipped") {
    return (
      <svg className="h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14" />
      </svg>
    );
  }
  return (
    <span className="h-2 w-2 rounded-full bg-gray-600" />
  );
}

export default function GradeEstimateProgressPanel({
  status,
  steps,
  identityLabel,
  errorMessage,
  elapsedLabel,
}: ProgressPanelProps) {
  const statusLabel =
    status === "done" ? "Complete" : status === "error" ? "Needs attention" : "In progress";

  return (
    <div className="bg-gray-900/40 border border-gray-700 rounded-xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">
          Analysis progress
        </h3>
        <div className="flex items-center gap-2">
          {elapsedLabel ? (
            <span className="text-xs text-gray-400 bg-gray-900/60 border border-gray-700 px-2.5 py-1 rounded-full">
              {elapsedLabel}
            </span>
          ) : null}
          <span className="text-xs text-gray-300 bg-gray-900/60 border border-gray-700 px-3 py-1 rounded-full">
            {statusLabel}
          </span>
        </div>
      </div>

      {identityLabel ? (
        <div className="mb-3">
          <p className="text-sm text-gray-200 font-medium">{identityLabel}</p>
          <p className="text-xs text-gray-500">Identity verified for this run</p>
        </div>
      ) : null}

      <div className="space-y-2">
        {STEP_LABELS.map((step) => {
          const entry = steps[step.key];
          const duration = formatDuration(entry.ms);
          const showDuration = entry.status === "done";
          return (
            <div key={step.key} className="space-y-1">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm text-gray-300">
                  <StatusIcon status={entry.status} />
                  <span>{step.label}</span>
                </div>
                <div className="text-xs text-gray-500">
                  {entry.status === "queued" ? "Queued" : null}
                  {entry.status === "running" ? "Running" : null}
                  {entry.status === "skipped" ? "Skipped" : null}
                  {entry.status === "error" ? "Issue" : null}
                  {showDuration && duration ? duration : null}
                  {showDuration && !duration ? "—" : null}
                </div>
              </div>
              {entry.status === "error" && entry.error ? (
                <div className="text-xs text-amber-300 pl-6">
                  {entry.error}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {errorMessage ? (
        <div className="mt-4 rounded-lg border border-amber-800/40 bg-amber-900/20 px-3 py-2 text-xs text-amber-200">
          {errorMessage}
        </div>
      ) : null}
    </div>
  );
}
