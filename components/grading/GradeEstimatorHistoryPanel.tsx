"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GradeEstimatorHistoryRun, GradeEstimate } from "@/types";
import {
  loadCachedHistoryRuns,
  mergeHistoryRuns,
  removeCachedHistoryRun,
} from "@/lib/grading/gradeEstimatorHistoryCache";

interface GradeEstimatorHistoryPanelProps {
  onSelect: (run: GradeEstimatorHistoryRun) => void;
  refreshToken?: number;
}

export default function GradeEstimatorHistoryPanel({
  onSelect,
  refreshToken = 0,
}: GradeEstimatorHistoryPanelProps) {
  const [runs, setRuns] = useState<GradeEstimatorHistoryRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);
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
      setError("History is temporarily unavailable.");
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
      return low === high ? `Est. ${low}` : `Est. ${low}-${high}`;
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
    <div className="mb-6">
      <button
        onClick={() => setIsExpanded((prev) => !prev)}
        className="flex items-center gap-2 text-sm font-medium text-gray-400 hover:text-white transition-colors w-full"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <span>Recent Grade Runs</span>
        <span className="text-gray-500">({runCountLabel})</span>
        <svg
          className={`w-4 h-4 ml-auto transition-transform ${isExpanded ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {isExpanded && (
        <div className="mt-3 p-4 bg-gray-800/50 rounded-xl border border-gray-700/50">
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 bg-gray-700/30 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : runs.length === 0 ? (
            <div>
              <p className="text-sm text-gray-400">
                No previous grade analyses yet.
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Run a Grade Probability analysis to see your history here.
              </p>
              {error ? (
                <p className="text-xs text-amber-300 mt-2">{error}</p>
              ) : null}
            </div>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {runs.map((run) => {
                const imageUrl = run.card.imageUrl || run.card.imageUrls?.[0];
                const title = run.card.player_name || "Unknown card";
                const subtitleParts = [
                  run.card.year,
                  run.card.set_name,
                  run.card.parallel_type,
                ].filter(Boolean);
                const subtitle = subtitleParts.join(" · ");
                const rangeLabel = formatRange(run.estimate);
                const confidence = run.estimate.grade_probabilities?.confidence;

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
                    className="w-full text-left p-3 bg-gray-700/30 hover:bg-gray-700/50 rounded-lg transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      {imageUrl ? (
                        <img
                          src={imageUrl}
                          alt={title}
                          className="w-10 h-14 object-cover rounded-md border border-gray-700"
                        />
                      ) : (
                        <div className="w-10 h-14 rounded-md border border-gray-700 bg-gray-800" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white truncate font-medium">{title}</p>
                        {subtitle ? (
                          <p className="text-xs text-gray-500 truncate mt-0.5">{subtitle}</p>
                        ) : null}
                        <div className="flex flex-wrap items-center gap-3 mt-1">
                          <span className="text-xs text-gray-500">
                            {formatTimeAgo(run.created_at)}
                          </span>
                          {rangeLabel ? (
                            <span className="text-xs text-gray-400">{rangeLabel}</span>
                          ) : null}
                          {confidence ? (
                            <span className="text-xs text-blue-300">{confidence} confidence</span>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={(e) => handleDeleteRun(run.id, e)}
                          className="p-1.5 text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity rounded"
                          title="Delete this grade run"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                        <div className="flex items-center gap-1 text-xs text-gray-500 group-hover:text-blue-300">
                          <span>Open</span>
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M9 5l7 7-7 7"
                            />
                          </svg>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
