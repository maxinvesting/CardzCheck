"use client";

import { useEffect, useMemo, useState } from "react";
import type { GradeScanLabel, GradeScanLabelGrader } from "@/types";

interface GradeScanLabelPanelProps {
  enabled: boolean;
  scanId: string | null;
  initialLabels?: GradeScanLabel[];
  onLabelSaved?: (label: GradeScanLabel) => void;
}

const GRADER_OPTIONS: Array<{ label: string; value: GradeScanLabelGrader }> = [
  { label: "PSA", value: "psa" },
  { label: "BGS", value: "bgs" },
  { label: "SGC", value: "sgc" },
  { label: "TAG", value: "tag" },
  { label: "Other", value: "other" },
];

const PSA_LABEL_OPTIONS = ["10", "9", "8", "7_or_lower"];
const BGS_LABEL_OPTIONS = ["9.5", "9", "8.5", "8_or_lower"];

function isRemoteScanId(scanId: string | null): boolean {
  if (!scanId) return false;
  return !scanId.startsWith("local-grade-run-");
}

function defaultLabelForGrader(grader: GradeScanLabelGrader): string {
  if (grader === "psa") return "10";
  if (grader === "bgs") return "9.5";
  return "";
}

function labelOptionsForGrader(grader: GradeScanLabelGrader): string[] {
  if (grader === "psa") return PSA_LABEL_OPTIONS;
  if (grader === "bgs") return BGS_LABEL_OPTIONS;
  return [];
}

export function GradeScanLabelPanel(props: GradeScanLabelPanelProps) {
  const [labels, setLabels] = useState<GradeScanLabel[]>(props.initialLabels ?? []);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [grader, setGrader] = useState<GradeScanLabelGrader>("psa");
  const [labelText, setLabelText] = useState<string>("10");
  const [evidenceUrl, setEvidenceUrl] = useState<string>("");

  const validScanId = useMemo(() => isRemoteScanId(props.scanId), [props.scanId]);
  const labelOptions = useMemo(() => labelOptionsForGrader(grader), [grader]);

  useEffect(() => {
    if (!props.enabled || !validScanId || !props.scanId) {
      setLabels(props.initialLabels ?? []);
      return;
    }

    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(
          `/api/business/grading/labels?scanId=${encodeURIComponent(props.scanId!)}`,
          { cache: "no-store" }
        );
        const payload = await response.json().catch(() => null);
        if (cancelled) return;

        if (!response.ok) {
          const message =
            typeof payload?.error === "string"
              ? payload.error
              : "Failed to load labels.";
          setError(message);
          return;
        }

        setLabels(Array.isArray(payload?.labels) ? payload.labels : []);
      } catch {
        if (!cancelled) {
          setError("Failed to load labels.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [props.enabled, props.initialLabels, props.scanId, validScanId]);

  useEffect(() => {
    const defaults = defaultLabelForGrader(grader);
    setLabelText(defaults);
  }, [grader]);

  if (!props.enabled) return null;

  const submit = async () => {
    if (!props.scanId || !validScanId) return;
    const trimmedLabel = labelText.trim();
    if (!trimmedLabel) {
      setError("Actual grade is required.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/business/grading/labels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scanId: props.scanId,
          grader,
          labelText: trimmedLabel,
          evidenceUrl: evidenceUrl.trim() || null,
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const message =
          typeof payload?.error === "string"
            ? payload.error
            : "Failed to save label.";
        setError(message);
        return;
      }

      const label = payload?.label as GradeScanLabel | undefined;
      if (!label) {
        setError("Label save response was invalid.");
        return;
      }

      setLabels((prev) => {
        const rest = prev.filter((row) => row.grader !== label.grader);
        return [label, ...rest].sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      });
      props.onLabelSaved?.(label);
    } catch {
      setError("Failed to save label.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="cc-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-[var(--biz-text)]">Add Actual Grade</h3>
          <p className="mt-1 text-xs text-[var(--biz-muted)]">
            Dev/admin labeling for calibrator training.
          </p>
        </div>
      </div>

      {!props.scanId ? (
        <p className="mt-3 text-xs text-[var(--biz-muted)]">
          Save a scan first to attach an actual grade label.
        </p>
      ) : !validScanId ? (
        <p className="mt-3 text-xs text-[var(--biz-muted)]">
          Local-only scan cannot be labeled until synced to server history.
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="space-y-1">
              <span className="text-[11px] font-medium text-[var(--biz-muted)]">Grader</span>
              <select
                value={grader}
                onChange={(event) => setGrader(event.target.value as GradeScanLabelGrader)}
                className="w-full rounded-lg border border-[color:var(--border)] bg-[var(--biz-surface)] px-2.5 py-2 text-sm text-[var(--biz-text)]"
              >
                {GRADER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1">
              <span className="text-[11px] font-medium text-[var(--biz-muted)]">Actual Grade</span>
              {labelOptions.length > 0 ? (
                <select
                  value={labelText}
                  onChange={(event) => setLabelText(event.target.value)}
                  className="w-full rounded-lg border border-[color:var(--border)] bg-[var(--biz-surface)] px-2.5 py-2 text-sm text-[var(--biz-text)]"
                >
                  {labelOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={labelText}
                  onChange={(event) => setLabelText(event.target.value)}
                  placeholder="e.g. 9"
                  className="w-full rounded-lg border border-[color:var(--border)] bg-[var(--biz-surface)] px-2.5 py-2 text-sm text-[var(--biz-text)]"
                />
              )}
            </label>

            <label className="space-y-1">
              <span className="text-[11px] font-medium text-[var(--biz-muted)]">
                Evidence Link (optional)
              </span>
              <input
                value={evidenceUrl}
                onChange={(event) => setEvidenceUrl(event.target.value)}
                placeholder="https://..."
                className="w-full rounded-lg border border-[color:var(--border)] bg-[var(--biz-surface)] px-2.5 py-2 text-sm text-[var(--biz-text)]"
              />
            </label>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void submit()}
              disabled={saving}
              className="cc-btn-primary rounded-lg px-3 py-2 text-xs font-medium disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save Label"}
            </button>
            {loading ? (
              <span className="text-xs text-[var(--biz-muted)]">Loading labels…</span>
            ) : null}
            {error ? <span className="text-xs text-rose-500">{error}</span> : null}
          </div>

          <div className="space-y-1">
            <p className="text-[11px] font-medium text-[var(--biz-muted)]">Stored Labels</p>
            {labels.length === 0 ? (
              <p className="text-xs text-[var(--biz-muted)]">No labels saved yet.</p>
            ) : (
              <ul className="space-y-1">
                {labels.map((label) => (
                  <li
                    key={`${label.scan_id}-${label.grader}`}
                    className="flex flex-wrap items-center gap-2 text-xs text-[var(--biz-text)]"
                  >
                    <span className="rounded bg-[color:var(--biz-hover)] px-1.5 py-0.5 font-semibold uppercase">
                      {label.grader}
                    </span>
                    <span className="font-medium">{label.label_text}</span>
                    <span className="text-[var(--biz-muted)]">
                      {new Date(label.created_at).toLocaleDateString()}
                    </span>
                    {label.evidence_url ? (
                      <a
                        href={label.evidence_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[var(--biz-primary)] hover:underline"
                      >
                        evidence
                      </a>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
