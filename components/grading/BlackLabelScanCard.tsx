"use client";

import { useRef, useState } from "react";
import GradeAnalysisAnimation from "@/components/grading/GradeAnalysisAnimation";
import GradeEstimateProgressPanel from "@/components/grading/GradeEstimateProgressPanel";
import GradeProbabilityPanel from "@/components/grading/GradeProbabilityPanel";
import GradeEstimatorValuePanel from "@/components/GradeEstimatorValuePanel";
import {
  TAG_OPTIONS,
  type GradeScanSessionStage,
  useGradeScanSession,
} from "@/components/grading/useGradeScanSession";
import type {
  CardIdentificationResult,
  GradeEstimate,
  WorthGradingResult,
} from "@/types";

type BlackLabelScanCardProps = {
  title: string;
  eyebrow: string;
  maxPhotos: number;
  autoStartEnabled: boolean;
  showGuidance?: boolean;
  canStartNow?: boolean;
  compact?: boolean;
  onStageChange?: (stage: GradeScanSessionStage) => void;
  onComplete?: (result: {
    jobId: string;
    card: CardIdentificationResult;
    estimate: GradeEstimate;
    postGradingValue?: WorthGradingResult | null;
  }) => void;
};

const STAGE_LABELS: Record<GradeScanSessionStage, string> = {
  draft: "Collecting",
  ready: "Ready",
  scheduled: "Queued",
  uploading: "Uploading",
  identifying: "Identifying",
  analyzing: "Analyzing",
  done: "Complete",
  error: "Needs attention",
};

const STAGE_CLASSES: Record<GradeScanSessionStage, string> = {
  draft: "border-white/10 bg-white/[0.04] text-white/65",
  ready: "border-[#8e7740]/40 bg-[#8e7740]/10 text-[#d8bf7a]",
  scheduled: "border-[#8e7740]/50 bg-[#8e7740]/15 text-[#ecdba0]",
  uploading: "border-[#8e7740]/50 bg-[#8e7740]/15 text-[#ecdba0]",
  identifying: "border-[#8e7740]/50 bg-[#8e7740]/15 text-[#ecdba0]",
  analyzing: "border-[#8e7740]/50 bg-[#8e7740]/15 text-[#ecdba0]",
  done: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
  error: "border-rose-500/30 bg-rose-500/10 text-rose-200",
};

function Alert({
  tone,
  text,
}: {
  tone: "warning" | "error";
  text: string;
}) {
  const classes =
    tone === "warning"
      ? "border-[#8e7740]/45 text-[#ecdba0]"
      : "border-rose-500/40 text-rose-200";

  return (
    <div className={`border-l pl-4 text-sm ${classes}`}>
      {text}
    </div>
  );
}

export default function BlackLabelScanCard({
  title,
  eyebrow,
  maxPhotos,
  autoStartEnabled,
  showGuidance = true,
  canStartNow = true,
  compact = false,
  onStageChange,
  onComplete,
}: BlackLabelScanCardProps) {
  const {
    stage,
    ownerCardName,
    setOwnerCardName,
    preScanNotes,
    setPreScanNotes,
    photos,
    addFiles,
    removePhoto,
    clearPhotos,
    updatePhotoTag,
    canAnalyze,
    queueLabel,
    identifiedCard,
    gradeEstimate,
    postGradingValue,
    gradeJob,
    error,
    notice,
    reset,
    startAnalysis,
    refinePanelOpen,
    setRefinePanelOpen,
    refinementText,
    setRefinementText,
    refining,
    refineError,
    runRefinement,
    appliedRefinement,
  } = useGradeScanSession({
    autoStartEnabled,
    maxPhotos,
    onStageChange,
    onComplete,
  });

  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const showUploader = stage !== "done";
  const showProgress =
    stage === "uploading" ||
    stage === "identifying" ||
    stage === "analyzing";
  const isBusy = showProgress || refining;

  return (
    <section className="border-t border-white/8 pt-6">
      <div className="px-1 pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          {eyebrow || title ? (
            <div>
              {eyebrow ? (
                <p className="text-[11px] uppercase tracking-[0.35em] text-[#b89a55]">
                  {eyebrow}
                </p>
              ) : null}
              {title ? (
                <h3 className={`${eyebrow ? "mt-2" : ""} text-xl font-semibold text-[#f6efe1]`}>
                  {title}
                </h3>
              ) : null}
            </div>
          ) : (
            <div />
          )}
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.22em] ${STAGE_CLASSES[stage]}`}
            >
              {STAGE_LABELS[stage]}
            </span>
            {(photos.length > 0 || gradeEstimate) && stage !== "uploading" && stage !== "identifying" && stage !== "analyzing" ? (
              <button
                type="button"
                onClick={reset}
                className="rounded-full border border-white/10 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-white/60 transition hover:border-[#8e7740]/35 hover:text-[#f3e7c8]"
              >
                Reset
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="space-y-5">
        {showUploader ? (
          <>
            <div className={`grid gap-8 ${showGuidance ? "lg:grid-cols-[1.15fr_0.85fr]" : ""}`}>
              <div className="space-y-5">
                <div>
                  <label className="text-[11px] uppercase tracking-[0.24em] text-[#c8aa67]">
                    Card title
                  </label>
                  {showGuidance ? (
                    <p className="mt-1 text-sm text-white/55">
                      Use the exact year, set, player, and parallel. This is the source of truth when image ID is uncertain.
                    </p>
                  ) : null}
                </div>
                <input
                  type="text"
                  value={ownerCardName}
                  onChange={(event) => setOwnerCardName(event.target.value)}
                  maxLength={220}
                  autoComplete="off"
                  disabled={isBusy}
                  placeholder="2023 Prizm Victor Wembanyama Silver Prizm #136"
                  className="w-full border-b border-white/12 bg-transparent px-0 py-3 text-sm text-[#f7f2e8] placeholder:text-white/25 focus:border-[#8e7740]/60 focus:outline-none"
                />

                <div>
                  <label className="text-[11px] uppercase tracking-[0.24em] text-[#c8aa67]">
                    Notes for the model
                  </label>
                  {showGuidance ? (
                    <p className="mt-1 text-sm text-white/55">
                      Optional observations. Mention centering issues, scratches, or concerns you want reviewed.
                    </p>
                  ) : null}
                </div>
                <textarea
                  rows={3}
                  maxLength={400}
                  value={preScanNotes}
                  onChange={(event) => setPreScanNotes(event.target.value)}
                  disabled={isBusy}
                  placeholder="Possible surface scratch near the top edge, centering looks slightly left heavy."
                  className="w-full resize-none border-b border-white/12 bg-transparent px-0 py-3 text-sm text-[#f7f2e8] placeholder:text-white/25 focus:border-[#8e7740]/60 focus:outline-none"
                />
              </div>

              {showGuidance ? (
                <div className="border-t border-white/8 pt-4 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-[#c8aa67]">
                    Scan rules
                  </p>
                  <ul className="mt-4 space-y-3 text-sm text-white/65">
                    <li>Front and back are required before the scan can start.</li>
                    <li>Close-ups are optional but strongly recommended for corners, edges, and surface.</li>
                    <li>Up to {maxPhotos} photos per card. First two are auto-tagged as front/back.</li>
                    <li>The scan starts automatically after your upload set settles.</li>
                  </ul>
                </div>
              ) : null}
            </div>

            <div
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                if (!isBusy) {
                  void addFiles(Array.from(event.dataTransfer.files ?? []));
                }
              }}
              onDragOver={(event) => {
                event.preventDefault();
                if (!isBusy) setDragging(true);
              }}
              onDragLeave={(event) => {
                event.preventDefault();
                setDragging(false);
              }}
              onClick={() => {
                if (!isBusy) inputRef.current?.click();
              }}
              className={`cursor-pointer border-y border-dashed px-6 py-10 text-center transition ${
                dragging
                  ? "border-[#b89a55] bg-[#b89a55]/6"
                  : "border-[#4b3b20] bg-white/[0.02] hover:border-[#8e7740]"
              } ${isBusy ? "pointer-events-none opacity-70" : ""}`}
            >
              <div className="mx-auto flex max-w-lg flex-col items-center gap-3">
                <div className="flex h-14 w-14 items-center justify-center rounded-full border border-[#4b3b20] bg-black/40">
                  <svg className="h-7 w-7 text-[#d3b46b]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <p className="text-lg font-medium text-[#f6efe1]">
                    {dragging ? "Drop card photos here" : showGuidance ? "Drop photos or click to upload" : "Upload front, back, and close-ups"}
                  </p>
                  {showGuidance ? (
                    <p className="mt-2 text-sm text-white/55">
                      JPG, PNG, or WebP. Sharp lighting wins. Use close-ups when the defect might be subtle.
                    </p>
                  ) : (
                    <p className="mt-2 text-sm text-white/45">
                      Front and back are required. JPG, PNG, or WebP.
                    </p>
                  )}
                </div>
                <p className="text-[11px] uppercase tracking-[0.24em] text-white/35">
                  {photos.length}/{maxPhotos} photos loaded
                </p>
              </div>
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                multiple
                disabled={isBusy}
                className="hidden"
                onChange={(event) => {
                  void addFiles(Array.from(event.target.files ?? []));
                  event.currentTarget.value = "";
                }}
              />
            </div>

            {photos.length > 0 ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-white/60">
                    {photos.length} photo{photos.length === 1 ? "" : "s"} staged
                  </p>
                  <button
                    type="button"
                    onClick={clearPhotos}
                    disabled={isBusy}
                    className="rounded-full border border-white/10 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-white/60 transition hover:border-[#8e7740]/35 hover:text-[#f3e7c8]"
                  >
                    Clear stack
                  </button>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                  {photos.map((photo, index) => (
                    <div key={photo.id} className="space-y-2">
                      <div className="relative">
                        <img
                          src={photo.preview}
                          alt={`Card upload ${index + 1}`}
                          className="h-36 w-full rounded-[18px] object-cover"
                        />
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            removePhoto(photo.id);
                          }}
                          disabled={isBusy}
                          className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/70 text-white/70 transition hover:text-white"
                          aria-label="Remove photo"
                        >
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                      <div className="mt-3 space-y-2">
                        <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.22em]">
                          <span className="text-white/35">Photo {index + 1}</span>
                          <span className="text-[#c8aa67]">{photo.tag}</span>
                        </div>
                        <select
                          value={photo.tag}
                          onChange={(event) => updatePhotoTag(photo.id, event.target.value as (typeof photo)["tag"])}
                          disabled={isBusy}
                          className="w-full border-b border-white/12 bg-transparent px-0 py-2 text-sm text-[#f7f2e8] focus:border-[#8e7740]/60 focus:outline-none"
                        >
                          {TAG_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void startAnalysis()}
                disabled={!canAnalyze || !canStartNow || isBusy}
                className={`rounded-full px-5 py-3 text-sm font-semibold uppercase tracking-[0.24em] transition ${
                  canAnalyze && canStartNow && !isBusy
                    ? "bg-[#b89a55] text-black hover:bg-[#d5b870]"
                    : "cursor-not-allowed bg-white/8 text-white/35"
                }`}
              >
                {autoStartEnabled ? "Analyze now" : "Run analysis"}
              </button>
              <p className="text-sm text-white/45">
                {showGuidance
                  ? canAnalyze
                    ? autoStartEnabled
                      ? queueLabel
                        ? `${queueLabel}. Use Analyze now to skip the wait.`
                        : "The run will auto-start after a short pause. Use Analyze now to skip the wait."
                      : !canStartNow
                        ? "Another card is processing first. This run will unlock when it reaches the front of the queue."
                        : queueLabel
                        ? `${queueLabel}.`
                        : "Ready. This card will start when it reaches the front of the queue."
                    : "Add a clear title plus front and back photos to arm the scan."
                  : canAnalyze
                    ? !canStartNow
                      ? "Queued behind another active card."
                      : autoStartEnabled
                        ? "Auto-start armed."
                        : queueLabel || "Ready to analyze."
                    : "Card title, front, and back required."}
              </p>
            </div>
          </>
        ) : null}

        {notice ? <Alert tone="warning" text={notice} /> : null}
        {error ? <Alert tone="error" text={error} /> : null}

        {showProgress ? (
          <div className="space-y-4">
            <GradeAnalysisAnimation
              imageUrl={identifiedCard?.imageUrl ?? photos[0]?.preview ?? null}
              estimate={gradeEstimate}
              valueResult={postGradingValue}
              onComplete={() => {}}
            />
            {gradeJob ? (
              <GradeEstimateProgressPanel
                status={gradeJob.status}
                steps={gradeJob.steps}
                elapsedLabel={null}
                flat
              />
            ) : null}
          </div>
        ) : null}

        {stage === "done" && gradeEstimate && identifiedCard ? (
          <div className="space-y-4">
            <GradeProbabilityPanel
              estimate={gradeEstimate}
              cardIdentity={identifiedCard}
              primaryImageUrl={identifiedCard.imageUrl}
              imageUrls={identifiedCard.imageUrls}
              scanPhotos={identifiedCard.scanPhotos}
              compact={compact}
              flat
              headerLabel="Grade Probability Engine"
              appliedRefinement={appliedRefinement}
            />

            {postGradingValue ? (
              <GradeEstimatorValuePanel result={postGradingValue} flat />
            ) : null}

            <div className="border-t border-white/8 pt-4">
              <button
                type="button"
                onClick={() => {
                  setRefinePanelOpen(!refinePanelOpen);
                }}
                className="flex w-full items-center justify-between py-2 text-left"
              >
                <span className="text-[11px] uppercase tracking-[0.24em] text-[#c8aa67]">
                  Refine analysis
                </span>
                <span className="text-sm text-white/40">
                  {refinePanelOpen ? "Hide" : "Open"}
                </span>
              </button>

              {refinePanelOpen ? (
                <div className="space-y-3 pt-4">
                  <p className="text-sm text-white/55">
                    Call out something the model missed. Refinements are free and re-run against the same scan set.
                  </p>
                  <textarea
                    rows={3}
                    maxLength={500}
                    value={refinementText}
                    onChange={(event) => setRefinementText(event.target.value)}
                    placeholder="There is a surface scratch on the upper left edge that was underweighted."
                    className="w-full resize-none border-b border-white/12 bg-transparent px-0 py-3 text-sm text-[#f7f2e8] placeholder:text-white/25 focus:border-[#8e7740]/60 focus:outline-none"
                  />
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="text-xs text-white/35">{refinementText.length}/500</span>
                    <button
                      type="button"
                      onClick={() => void runRefinement()}
                      disabled={!refinementText.trim() || refining}
                      className={`rounded-full px-4 py-2 text-sm font-semibold uppercase tracking-[0.24em] transition ${
                        refinementText.trim() && !refining
                          ? "bg-[#b89a55] text-black hover:bg-[#d5b870]"
                          : "cursor-not-allowed bg-white/8 text-white/35"
                      }`}
                    >
                      {refining ? "Re-running" : "Re-analyze"}
                    </button>
                  </div>
                  {refineError ? <Alert tone="error" text={refineError} /> : null}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
