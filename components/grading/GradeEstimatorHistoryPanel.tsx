"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GradeEstimatorHistoryRun, GradeEstimate } from "@/types";
import {
  loadCachedHistoryRuns,
  mergeHistoryRuns,
  removeCachedHistoryRun,
} from "@/lib/grading/gradeEstimatorHistoryCache";
import { confidencePillClasses } from "@/theme/tokens";

interface GradeEstimatorHistoryPanelProps {
  onSelect: (run: GradeEstimatorHistoryRun) => void;
  refreshToken?: number;
  compact?: boolean;
  initialExpanded?: boolean;
}

export default function GradeEstimatorHistoryPanel({
  onSelect,
  refreshToken = 0,
  compact = false,
  initialExpanded,
}: GradeEstimatorHistoryPanelProps) {
  const [runs, setRuns] = useState<GradeEstimatorHistoryRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(initialExpanded ?? compact);
  const [error, setError] = useState<string | null>(null);
  const didAutoExpand = useRef(false);

  const loadRuns = useCallback(async () => {
    setLoading(true);
    setError(null);
    const cachedRuns = loadCachedHistoryRuns();
    try {
      const res = await fetch("/api/grade-estimator/history");
      if (res.status === 401 || res.status === 403) {
        setRuns(cachedRuns);
        setError(null);
        return;
      }
      if (!res.ok) {
        setRuns(cachedRuns);
        setError(cachedRuns.length === 0 ? "History is temporarily unavailable." : null);
        return;
      }
      const data = await res.json();
      if (Array.isArray(data?.runs)) {
        setRuns(mergeHistoryRuns(data.runs, cachedRuns));
      } else {
        setRuns(cachedRuns);
      }
    } catch (err) {
      console.error("Failed to load grade estimator history:", err);
      setRuns(cachedRuns);
      setError(cachedRuns.length === 0 ? "History is temporarily unavailable." : null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRuns();
  }, [loadRuns, refreshToken]);

  useEffect(() => {
    if (runs.length > 0 && !didAutoExpand.current) {
      setIsExpanded(true);
      didAutoExpand.current = true;
    }
  }, [runs.length]);

  const formatTimeAgo = useCallback((dateStr: string): string => {
    const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (seconds < 60) return "just now";
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return new Date(dateStr).toLocaleDateString();
  }, []);

  const formatGrade = useCallback((value: number): string => {
    if (!Number.isFinite(value)) return "";
    if (Number.isInteger(value)) return String(value);
    return value.toFixed(1).replace(/\.0$/, "");
  }, []);

  const formatRange = useCallback(
    (estimate: GradeEstimate): string | null => {
      const low = formatGrade(estimate.estimated_grade_low);
      const high = formatGrade(estimate.estimated_grade_high);
      if (!low || !high) return null;
      return low === high ? `PSA ${low}` : `PSA ${low}–${high}`;
    },
    [formatGrade]
  );

  const handleDeleteRun = useCallback(
    async (runId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      setRuns((prev) => prev.filter((r) => r.id !== runId));
      removeCachedHistoryRun(runId);
      try {
        await fetch(`/api/grade-estimator/history?id=${encodeURIComponent(runId)}`, {
          method: "DELETE",
        });
      } catch (err) {
        console.error("Failed to delete grade run:", err);
      }
    },
    []
  );

  const runCountLabel = useMemo(() => runs.length, [runs.length]);

  return (
    <div className={compact ? "" : "mb-6"}>
      {/* Section toggle */}
      <button
        onClick={() => setIsExpanded((prev) => !prev)}
        className="flex w-full items-center gap-2 text-xs font-medium text-[var(--muted)] transition-colors hover:text-[var(--biz-text)]"
      >
        <svg
          className="w-3.5 h-3.5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <span>Recent Scans</span>
        {runCountLabel > 0 ? (
          <span className="text-[var(--muted)]">({runCountLabel})</span>
        ) : null}
        <svg
          className={`w-3.5 h-3.5 ml-auto transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {isExpanded ? (
        <div className={`cc-surface mt-3 ${compact ? "p-3" : "p-4"}`}>
          {loading ? (
            <div className={`space-y-2 ${compact ? "" : "py-1"}`}>
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-14 rounded-lg bg-[color:var(--biz-hover)] animate-pulse" />
              ))}
            </div>
          ) : runs.length === 0 ? (
            <div className="py-2">
              <p className="text-sm text-[var(--biz-text)]">No scans yet.</p>
              <p className="mt-1 text-xs text-[var(--muted)]">
                Upload a card photo to run your first analysis.
              </p>
              {error ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <p className="text-xs text-amber-700">{error}</p>
                  <button
                    onClick={() => void loadRuns()}
                    className="text-xs font-medium text-[var(--biz-primary)] hover:underline"
                  >
                    Retry
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <div className={`space-y-1 overflow-y-auto ${compact ? "max-h-56" : "max-h-80"}`}>
              {runs.map((run) => {
                const imageUrl = run.card.imageUrl || run.card.imageUrls?.[0];
                const title = run.card.player_name || "Unknown card";
                const metaParts = [
                  run.card.year,
                  run.card.set_name,
                  run.card.parallel_type,
                ].filter(Boolean);
                const meta = metaParts.join(" · ");
                const rangeLabel = formatRange(run.estimate);
                const confidence = run.estimate.grade_probabilities?.confidence;
                const pillClass = confidence ? (confidencePillClasses[confidence] ?? confidencePillClasses.medium) : null;

                return (
                  <div
                    key={run.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`Open ${title}`}
                    onClick={() => onSelect(run)}
                    onKeyDown={(event) => {
                      if (event.currentTarget !== event.target) return;
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onSelect(run);
                      }
                    }}
                    className="group flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition-colors hover:bg-[color:var(--biz-hover)]"
                  >
                    {/* Card thumbnail */}
                    {imageUrl ? (
                      <img
                        src={imageUrl}
                        alt={title}
                        className="h-12 w-9 shrink-0 rounded-md border border-[color:var(--border)] object-cover"
                      />
                    ) : (
                      <div className="h-12 w-9 shrink-0 rounded-md border border-[color:var(--border)] bg-[color:var(--biz-surface-soft)]" />
                    )}

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm font-medium leading-snug text-[var(--biz-text)]">{title}</p>
                      {meta ? (
                        <p className="mt-0.5 truncate text-xs text-[var(--muted)]">{meta}</p>
                      ) : null}
                      <div className="flex flex-wrap items-center gap-2 mt-1.5">
                        <span className="text-[10px] text-[var(--muted)]">
                          {formatTimeAgo(run.created_at)}
                        </span>
                        {rangeLabel ? (
                          <span className="text-[10px] font-medium text-[var(--muted)]">{rangeLabel}</span>
                        ) : null}
                        {confidence && pillClass ? (
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wide ${pillClass}`}>
                            {confidence}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={(e) => void handleDeleteRun(run.id, e)}
                        className="rounded p-1.5 text-[var(--muted)] opacity-0 transition-all group-hover:opacity-100 hover:text-rose-400"
                        title="Delete this scan"
                        aria-label="Delete this scan"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                      <svg
                        className="h-4 w-4 text-[var(--muted)] transition-colors group-hover:text-[var(--biz-text)]"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M9 5l7 7-7 7"
                        />
                      </svg>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
