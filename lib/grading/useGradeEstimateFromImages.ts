"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GradeEstimate } from "@/types";
import type { GradeEstimateJobStatusResponse } from "@/lib/grading/gradeEstimateJob";
import type { GradeEstimatorCardInput } from "@/lib/grade-estimator/value";

const POLL_INTERVAL_MS = 900;

export type GradeEstimateFromImagesStatus =
  | "idle"
  | "starting"
  | "running"
  | "done"
  | "error";

export interface UseGradeEstimateFromImagesResult {
  /** Start a new grade estimate. No-op if imageUrls.length === 0. */
  run: () => Promise<void>;
  status: GradeEstimateFromImagesStatus;
  jobId: string | null;
  job: GradeEstimateJobStatusResponse | null;
  estimate: GradeEstimate | null;
  error: string | null;
  /** True while starting or polling (running). */
  isRunning: boolean;
  /** Reset to idle and clear estimate/error (e.g. for retry). */
  reset: () => void;
}

export interface UseGradeEstimateFromImagesOptions {
  imageUrls: string[];
  card?: GradeEstimatorCardInput | null;
  /** If true, do not start polling automatically after run(). Caller handles polling. */
  manualPoll?: boolean;
}

export function useGradeEstimateFromImages({
  imageUrls,
  card = null,
  manualPoll = false,
}: UseGradeEstimateFromImagesOptions): UseGradeEstimateFromImagesResult {
  const [status, setStatus] = useState<GradeEstimateFromImagesStatus>("idle");
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<GradeEstimateJobStatusResponse | null>(null);
  const [estimate, setEstimate] = useState<GradeEstimate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const reset = useCallback(() => {
    setStatus("idle");
    setJobId(null);
    setJob(null);
    setEstimate(null);
    setError(null);
    cancelledRef.current = true;
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const run = useCallback(async () => {
    const urls = imageUrls?.filter((u) => typeof u === "string" && u.trim()) ?? [];
    if (urls.length === 0) return;

    cancelledRef.current = false;
    setError(null);
    setEstimate(null);
    setJob(null);
    setStatus("starting");

    try {
      const body =
        urls.length > 1
          ? { imageUrls: urls, card: card ?? undefined }
          : { imageUrl: urls[0], card: card ?? undefined };

      const response = await fetch("/api/grade-estimate/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const payload = await response.json().catch(() => null);
      const message =
        payload?.reason ?? payload?.error ?? "Failed to start grade estimate";

      if (!response.ok) {
        setError(message);
        setStatus("error");
        return;
      }

      const id = payload?.jobId;
      if (!id) {
        setError("No job ID returned");
        setStatus("error");
        return;
      }

      setJobId(id);
      setStatus("running");
      setJob({
        jobId: id,
        status: "queued",
        startedAt: Date.now(),
        steps: {
          ocr_identity: { status: "queued" },
          grade_model: { status: "queued" },
          parse_validate: { status: "queued" },
          post_grading_value: { status: "queued" },
        },
        partial: {},
        final: null,
        error: null,
      });

      if (manualPoll) return;

      const poll = async () => {
        if (cancelledRef.current) return;
        try {
          const res = await fetch(`/api/grade-estimate/status?jobId=${encodeURIComponent(id)}`);
          if (!res.ok) {
            setError("Failed to get job status");
            setStatus("error");
            if (intervalRef.current) {
              clearInterval(intervalRef.current);
              intervalRef.current = null;
            }
            return;
          }
          const data: GradeEstimateJobStatusResponse = await res.json();
          if (cancelledRef.current) return;
          setJob(data);

          if (data.final?.estimate) {
            setEstimate(data.final.estimate);
          }

          if (data.status === "done") {
            setStatus("done");
            setEstimate(data.final?.estimate ?? null);
            if (intervalRef.current) {
              clearInterval(intervalRef.current);
              intervalRef.current = null;
            }
          } else if (data.status === "error") {
            setError(data.error ?? "Grade estimate failed");
            setStatus("error");
            if (intervalRef.current) {
              clearInterval(intervalRef.current);
              intervalRef.current = null;
            }
          }
        } catch (err) {
          if (cancelledRef.current) return;
          setError(err instanceof Error ? err.message : "Status check failed");
          setStatus("error");
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
        }
      };

      void poll();
      intervalRef.current = setInterval(poll, POLL_INTERVAL_MS);
    } catch (err) {
      if (cancelledRef.current) return;
      setError(err instanceof Error ? err.message : "Failed to start grade estimate");
      setStatus("error");
    }
  }, [imageUrls, card, manualPoll]);

  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, []);

  const isRunning = status === "starting" || status === "running";

  return {
    run,
    status,
    jobId,
    job,
    estimate,
    error,
    isRunning,
    reset,
  };
}
