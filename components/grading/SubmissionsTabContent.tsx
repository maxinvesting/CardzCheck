"use client";

import { useCallback, useRef, useState } from "react";
import SubmissionBuilderPanel, {
  type SubmissionDetailItem,
} from "@/components/grading/SubmissionBuilderPanel";
import SubmissionAIWalkthrough from "@/components/grading/SubmissionAIWalkthrough";
import type { SubmissionAIWalkthroughState } from "@/lib/grading/submissions/types";

// Max concurrent AI analysis requests to avoid hammering eBay
const BATCH_CONCURRENCY = 3;
const BATCH_STAGGER_MS = 400;

export default function SubmissionsTabContent({
  blackLabel = false,
}: {
  blackLabel?: boolean;
}) {
  // Map of item.id → walkthrough state
  const [aiStates, setAiStates] = useState<
    Map<string, SubmissionAIWalkthroughState>
  >(new Map());

  // Track which items have been sent for analysis (avoids re-triggering on re-renders)
  const processedRef = useRef<Set<string>>(new Set());

  const triggerAnalysis = useCallback(async (item: SubmissionDetailItem) => {
    setAiStates((prev) => new Map(prev).set(item.id, { status: "loading" }));

    try {
      const response = await fetch("/api/grading/submissions/ai-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: item.title,
          cost_basis_cents: item.cost_basis_cents ?? null,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error ?? `HTTP ${response.status}`);
      }

      const data = await response.json();
      setAiStates((prev) =>
        new Map(prev).set(item.id, { status: "done", data })
      );
    } catch (err) {
      setAiStates((prev) =>
        new Map(prev).set(item.id, {
          status: "error",
          message:
            err instanceof Error ? err.message : "Analysis unavailable",
        })
      );
    }
  }, []);

  const handleItemsLoaded = useCallback(
    (items: SubmissionDetailItem[]) => {
      const newItems = items.filter(
        (item) => !processedRef.current.has(item.id)
      );

      if (newItems.length === 0) return;

      // Mark all as queued immediately to prevent double-triggering
      newItems.forEach((item) => processedRef.current.add(item.id));

      // Stagger launches up to BATCH_CONCURRENCY at once
      newItems.forEach((item, index) => {
        const slot = index % BATCH_CONCURRENCY;
        const batchGroup = Math.floor(index / BATCH_CONCURRENCY);
        const delay = (batchGroup * BATCH_CONCURRENCY + slot) * BATCH_STAGGER_MS;
        setTimeout(() => triggerAnalysis(item), delay);
      });
    },
    [triggerAnalysis]
  );

  const renderItemExtra = useCallback(
    (item: SubmissionDetailItem) => {
      const state: SubmissionAIWalkthroughState =
        aiStates.get(item.id) ?? { status: "idle" };
      return <SubmissionAIWalkthrough state={state} />;
    },
    [aiStates]
  );

  return (
    <SubmissionBuilderPanel
      identifiedCard={null}
      gradeEstimate={null}
      blackLabel={blackLabel}
      renderItemExtra={renderItemExtra}
      onItemsLoaded={handleItemsLoaded}
    />
  );
}
