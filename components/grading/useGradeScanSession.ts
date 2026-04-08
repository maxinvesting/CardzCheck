"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { normalizeIdentificationResult } from "@/lib/card-identity/result";
import { identifyCardFromImages } from "@/lib/identify-card/client";
import { normalizeHttpUrl, uniqueHttpUrls } from "@/lib/collection-images";
import { normalizeGradeScanPhotos } from "@/lib/grading/scanPhotos";
import { gradingCopy } from "@/copy/grading";
import type {
  CardIdentificationResult,
  GradeEstimate,
  GradeScanPhoto,
  GradeScanPhotoKind,
  WorthGradingResult,
} from "@/types";
import type { GradeEstimateJobStatusResponse } from "@/lib/grading/gradeEstimateJob";

export type PhotoTag =
  | "auto"
  | "front"
  | "back"
  | "corner"
  | "edges"
  | "surface"
  | "other";

export type PhotoDraft = {
  id: string;
  file: File;
  preview: string;
  tag: PhotoTag;
};

export type GradeScanSessionStage =
  | "draft"
  | "ready"
  | "scheduled"
  | "uploading"
  | "identifying"
  | "analyzing"
  | "done"
  | "error";

type UseGradeScanSessionOptions = {
  autoStartEnabled: boolean;
  maxPhotos: number;
  onStageChange?: (stage: GradeScanSessionStage) => void;
  onComplete?: (result: {
    jobId: string;
    card: CardIdentificationResult;
    estimate: GradeEstimate;
    postGradingValue?: WorthGradingResult | null;
  }) => void;
};

const AUTO_START_DELAY_MS = 1200;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_FALLBACK_DATA_URL_BYTES = 350 * 1024;
const MIN_OWNER_CARD_NAME_LEN = 3;

export const TAG_OPTIONS: Array<{ value: PhotoTag; label: string }> = [
  { value: "auto", label: "Auto-detect" },
  { value: "front", label: "Front" },
  { value: "back", label: "Back" },
  { value: "corner", label: "Corner" },
  { value: "edges", label: "Edge" },
  { value: "surface", label: "Surface" },
  { value: "other", label: "Other" },
];

function tagToKind(tag: PhotoTag): GradeScanPhotoKind {
  switch (tag) {
    case "front":
      return "front";
    case "back":
      return "back";
    case "corner":
      return "corner_tl";
    case "edges":
      return "edges";
    case "surface":
      return "surface";
    default:
      return "other";
  }
}

function defaultTagForIndex(index: number): PhotoTag {
  if (index === 0) return "front";
  if (index === 1) return "back";
  return "auto";
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function estimateDataUrlByteLength(dataUrl: string): number {
  const commaIndex = dataUrl.indexOf(",");
  if (commaIndex === -1) return 0;
  const base64 = dataUrl.slice(commaIndex + 1);
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

function isDataUrl(value: string): boolean {
  return value.trim().startsWith("data:");
}

async function compressDataUrl(
  dataUrl: string,
  options: { maxWidth: number; maxHeight: number; quality: number }
): Promise<string | null> {
  if (typeof window === "undefined") return null;
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(1, options.maxWidth / image.width, options.maxHeight / image.height);
      const width = Math.max(1, Math.round(image.width * scale));
      const height = Math.max(1, Math.round(image.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(null);
        return;
      }
      ctx.drawImage(image, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", options.quality));
    };
    image.onerror = () => resolve(null);
    image.src = dataUrl;
  });
}

function getFrontAndBack(photos: PhotoDraft[]): { front: PhotoDraft | null; back: PhotoDraft | null } {
  const explicitFront = photos.find((photo) => photo.tag === "front") ?? null;
  const explicitBack = photos.find((photo) => photo.tag === "back") ?? null;

  return {
    front: explicitFront ?? photos[0] ?? null,
    back: explicitBack ?? photos[1] ?? null,
  };
}

export function useGradeScanSession({
  autoStartEnabled,
  maxPhotos,
  onStageChange,
  onComplete,
}: UseGradeScanSessionOptions) {
  const [stage, setStage] = useState<GradeScanSessionStage>("draft");
  const [ownerCardName, setOwnerCardName] = useState("");
  const [preScanNotes, setPreScanNotes] = useState("");
  const [photos, setPhotos] = useState<PhotoDraft[]>([]);
  const [identifiedCard, setIdentifiedCard] = useState<CardIdentificationResult | null>(null);
  const [gradeEstimate, setGradeEstimate] = useState<GradeEstimate | null>(null);
  const [postGradingValue, setPostGradingValue] = useState<WorthGradingResult | null>(null);
  const [gradeJob, setGradeJob] = useState<GradeEstimateJobStatusResponse | null>(null);
  const [gradeJobId, setGradeJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [refinePanelOpen, setRefinePanelOpen] = useState(false);
  const [refinementText, setRefinementText] = useState("");
  const [refining, setRefining] = useState(false);
  const [refineError, setRefineError] = useState<string | null>(null);
  const [appliedRefinement, setAppliedRefinement] = useState<string | null>(null);
  const autoStartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCompletedJobIdRef = useRef<string | null>(null);

  const validateFile = useCallback((file: File): string | null => {
    if (!file.type.startsWith("image/")) return "Please upload image files only.";
    if (file.size > MAX_IMAGE_BYTES) return "Each image must be less than 8MB.";
    return null;
  }, []);

  const reset = useCallback(() => {
    if (autoStartTimerRef.current) {
      clearTimeout(autoStartTimerRef.current);
      autoStartTimerRef.current = null;
    }
    setStage("draft");
    setOwnerCardName("");
    setPreScanNotes("");
    setPhotos([]);
    setIdentifiedCard(null);
    setGradeEstimate(null);
    setPostGradingValue(null);
    setGradeJob(null);
    setGradeJobId(null);
    setError(null);
    setNotice(null);
    setRefinePanelOpen(false);
    setRefinementText("");
    setRefining(false);
    setRefineError(null);
    setAppliedRefinement(null);
    lastCompletedJobIdRef.current = null;
  }, []);

  const uploadFile = useCallback(async (file: File, fallbackDataUrl: string): Promise<string> => {
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Authentication required for storage uploads");
      const fileName = `${user.id}/${Date.now()}-${file.name}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("card-images")
        .upload(fileName, file);
      if (uploadError) throw new Error(uploadError.message);
      const {
        data: { publicUrl },
      } = supabase.storage.from("card-images").getPublicUrl(uploadData.path);
      return publicUrl;
    } catch {
      const fallbackBytes = estimateDataUrlByteLength(fallbackDataUrl);
      if (fallbackBytes <= MAX_FALLBACK_DATA_URL_BYTES) return fallbackDataUrl;
      const compressed = await compressDataUrl(fallbackDataUrl, {
        maxWidth: 1200,
        maxHeight: 1200,
        quality: 0.72,
      });
      return compressed || fallbackDataUrl;
    }
  }, []);

  const canAnalyze = useMemo(() => {
    const { front, back } = getFrontAndBack(photos);
    return ownerCardName.trim().length >= MIN_OWNER_CARD_NAME_LEN && Boolean(front && back);
  }, [ownerCardName, photos]);

  const queueLabel = useMemo(() => {
    if (stage === "scheduled" || (autoStartEnabled && stage === "ready")) {
      return "Queued to auto-start";
    }
    if (stage === "ready") {
      return "Waiting in queue";
    }
    return null;
  }, [autoStartEnabled, stage]);

  const startAnalysis = useCallback(async () => {
    if (!canAnalyze) return;
    if (["uploading", "identifying", "analyzing"].includes(stage)) return;

    if (autoStartTimerRef.current) {
      clearTimeout(autoStartTimerRef.current);
      autoStartTimerRef.current = null;
    }

    setError(null);
    setNotice(null);
    setIdentifiedCard(null);
    setGradeEstimate(null);
    setPostGradingValue(null);
    setGradeJob(null);
    setGradeJobId(null);
    setAppliedRefinement(null);
    setRefinePanelOpen(false);
    setRefineError(null);

    try {
      setStage("uploading");
      const uploadedUrls = await Promise.all(
        photos.map((photo) => uploadFile(photo.file, photo.preview))
      );

      const scanPhotos = normalizeGradeScanPhotos(
        photos.map((photo, index) => ({
          url: uploadedUrls[index],
          kind: tagToKind(photo.tag),
          sort_order: index,
        }))
      );

      const frontIdx = photos.findIndex((photo) => photo.tag === "front");
      const backIdx = photos.findIndex((photo) => photo.tag === "back");
      const frontUrl = uploadedUrls[frontIdx >= 0 ? frontIdx : 0] ?? uploadedUrls[0];
      const backUrl = uploadedUrls[backIdx >= 0 ? backIdx : 1] ?? uploadedUrls[1];

      if (!frontUrl || !backUrl) {
        throw new Error("Front and back photos are required before analysis.");
      }

      setStage("identifying");
      const identifyInput = [frontUrl, backUrl].some(isDataUrl)
        ? { imageUrl: frontUrl }
        : { imageUrls: [frontUrl, backUrl] };

      const identify = await identifyCardFromImages(identifyInput);
      if (!identify.ok || !identify.data || "error" in identify.data) {
        throw new Error(identify.errorMessage || "Failed to process image.");
      }

      const result = identify.data;
      const allImageUrls = scanPhotos
        .map((photo) => photo.url)
        .filter((url) => typeof url === "string" && url.trim().length > 0);
      const sanitizedImageUrls = uniqueHttpUrls(allImageUrls);
      const userImageUrl =
        normalizeHttpUrl(frontUrl) || normalizeHttpUrl(sanitizedImageUrls[0] || null);
      const displayImageUrl =
        userImageUrl ||
        allImageUrls.find((url) => typeof url === "string" && url.trim().length > 0) ||
        "";

      if (result.card_identity?.warnings?.includes("parse_error")) {
        setNotice("We couldn't read the card details clearly. We used your title and will keep confidence conservative.");
      } else if (result.confidence === "low") {
        setNotice(
          `Card identified with low confidence. We used your title "${ownerCardName.trim()}" as the primary card label.`
        );
      }

      const declared = ownerCardName.trim();
      const merged = normalizeIdentificationResult({
        player_name: declared,
        owner_declared_title: declared,
        players: declared ? [declared] : result.players || [result.player_name],
        year: undefined,
        set_name: undefined,
        insert: undefined,
        grade: result.grade || undefined,
        card_number: undefined,
        parallel_type: undefined,
        variation: undefined,
        imageUrl: displayImageUrl,
        imageUrls: allImageUrls,
        scanPhotos,
        userImageUrl: userImageUrl || undefined,
        confidence: result.confidence,
        cardIdentity: result.card_identity,
      });

      setIdentifiedCard(merged);
      setStage("analyzing");

      const response = await fetch("/api/grade-estimate/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          front_url: frontUrl,
          back_url: backUrl,
          closeups: scanPhotos
            .filter((photo) => photo.kind !== "front" && photo.kind !== "back")
            .map((photo, index) => ({ url: photo.url, kind: photo.kind, sort_order: index })),
          scanPhotos: scanPhotos.map((photo, index) => ({ ...photo, sort_order: index })),
          card: {
            player_name: declared,
          },
          preScanNotes: preScanNotes.trim() || undefined,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(
          payload?.error ?? payload?.reason ?? gradingCopy.status.estimateFailedFallback
        );
      }

      const payload: GradeEstimateJobStatusResponse & { jobId?: string } = await response.json();
      if (!payload?.jobId) {
        throw new Error(gradingCopy.status.estimateFailedFallback);
      }

      setGradeJob(payload);

      if (payload.status === "done") {
        const estimate = payload.final?.estimate ?? null;
        if (!estimate) {
          throw new Error(gradingCopy.status.estimateFailedFallback);
        }

        setGradeEstimate(estimate);
        setPostGradingValue(payload.final?.postGradingValue ?? null);
        setStage("done");
        setGradeJobId(null);
        if (lastCompletedJobIdRef.current !== payload.jobId) {
          lastCompletedJobIdRef.current = payload.jobId;
          onComplete?.({
            jobId: payload.jobId,
            card: merged,
            estimate,
            postGradingValue: payload.final?.postGradingValue ?? null,
          });
        }
        return;
      }

      if (payload.status === "error") {
        throw new Error(payload.error ?? gradingCopy.status.estimateFailedFallback);
      }

      setGradeJobId(payload.jobId);
    } catch (analysisError) {
      setError(
        analysisError instanceof Error
          ? analysisError.message
          : gradingCopy.status.estimateFailedFallback
      );
      setStage("error");
    }
  }, [canAnalyze, onComplete, ownerCardName, photos, preScanNotes, stage, uploadFile]);

  const addFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      const nextFiles = files.slice(0, Math.max(0, maxPhotos - photos.length));
      for (const file of nextFiles) {
        const validationError = validateFile(file);
        if (validationError) {
          setError(validationError);
          return;
        }
      }

      setError(null);
      const previews = await Promise.all(nextFiles.map((file) => readFileAsDataUrl(file)));
      setPhotos((previous) => {
        const startIndex = previous.length;
        const additions = nextFiles.map((file, index): PhotoDraft => ({
          id: `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
          file,
          preview: previews[index],
          tag: defaultTagForIndex(startIndex + index),
        }));
        return [...previous, ...additions];
      });
    },
    [maxPhotos, photos.length, validateFile]
  );

  const removePhoto = useCallback((photoId: string) => {
    setPhotos((previous) => previous.filter((photo) => photo.id !== photoId));
  }, []);

  const clearPhotos = useCallback(() => {
    setPhotos([]);
    setError(null);
    setNotice(null);
  }, []);

  const updatePhotoTag = useCallback((photoId: string, tag: PhotoTag) => {
    setPhotos((previous) =>
      previous.map((photo) => (photo.id === photoId ? { ...photo, tag } : photo))
    );
  }, []);

  const runRefinement = useCallback(async () => {
    if (!identifiedCard || !refinementText.trim()) return;

    setRefining(true);
    setRefineError(null);

    const rawUrls = identifiedCard.imageUrls ?? (identifiedCard.imageUrl ? [identifiedCard.imageUrl] : []);
    const fallbackPhotos: GradeScanPhoto[] = rawUrls.map((url, index) => ({
      url,
      kind: (index === 0 ? "front" : "back") as GradeScanPhoto["kind"],
      sort_order: index,
    }));
    const scanPhotos = normalizeGradeScanPhotos(
      identifiedCard.scanPhotos?.length ? identifiedCard.scanPhotos : fallbackPhotos
    );

    try {
      const response = await fetch("/api/grade-estimate/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          correctionText: refinementText.trim(),
          scanPhotos: scanPhotos.map((photo, index) => ({ ...photo, sort_order: index })),
          front_url: scanPhotos.find((photo) => photo.kind === "front")?.url,
          back_url: scanPhotos.find((photo) => photo.kind === "back")?.url,
          closeups: scanPhotos
            .filter((photo) => photo.kind !== "front" && photo.kind !== "back")
            .map((photo, index) => ({ url: photo.url, kind: photo.kind, sort_order: index })),
          card: {
            player_name: identifiedCard.player_name,
            game: identifiedCard.cardIdentity?.sport ?? undefined,
            sport: identifiedCard.cardIdentity?.sport ?? undefined,
            year: identifiedCard.year,
            set_name: identifiedCard.set_name,
            card_number: identifiedCard.card_number,
            parallel_type: identifiedCard.parallel_type,
            variation: identifiedCard.variation,
            insert: identifiedCard.insert,
          },
          priorIdentity: identifiedCard.cardIdentity ?? undefined,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error ?? "Re-analysis failed. Please try again.");
      }

      const payload: GradeEstimateJobStatusResponse = await response.json();
      if (payload.status === "done" && payload.final?.estimate) {
        setGradeEstimate(payload.final.estimate);
        setPostGradingValue(payload.final?.postGradingValue ?? null);
        setAppliedRefinement(refinementText.trim());
        setRefinementText("");
        setRefinePanelOpen(false);
        setGradeJob(payload);
      } else if (payload.status === "error") {
        throw new Error(payload.error ?? "Re-analysis failed. Please try again.");
      }
    } catch (refineErrorValue) {
      setRefineError(
        refineErrorValue instanceof Error
          ? refineErrorValue.message
          : "Re-analysis failed. Please try again."
      );
    } finally {
      setRefining(false);
    }
  }, [identifiedCard, refinementText]);

  useEffect(() => {
    onStageChange?.(stage);
  }, [onStageChange, stage]);

  useEffect(() => {
    if (
      gradeEstimate ||
      ["uploading", "identifying", "analyzing", "scheduled", "done"].includes(stage)
    ) {
      return;
    }

    setStage(canAnalyze ? "ready" : "draft");
  }, [canAnalyze, gradeEstimate, stage]);

  useEffect(() => {
    if (!gradeJobId) return;

    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const poll = async () => {
      try {
        const response = await fetch(`/api/grade-estimate/status?jobId=${gradeJobId}`);
        if (!response.ok) throw new Error(gradingCopy.status.estimateFailedFallback);
        const payload: GradeEstimateJobStatusResponse = await response.json();
        if (cancelled) return;

        setGradeJob(payload);
        if (payload.final?.estimate) {
          setGradeEstimate(payload.final.estimate);
        }

        if (payload.status === "done") {
          setPostGradingValue(payload.final?.postGradingValue ?? null);
          setStage("done");
          setGradeJobId(null);
          if (
            payload.final?.estimate &&
            identifiedCard &&
            lastCompletedJobIdRef.current !== payload.jobId
          ) {
            lastCompletedJobIdRef.current = payload.jobId;
            onComplete?.({
              jobId: payload.jobId,
              card: identifiedCard,
              estimate: payload.final.estimate,
              postGradingValue: payload.final?.postGradingValue ?? null,
            });
          }
          if (timer) clearInterval(timer);
        } else if (payload.status === "error") {
          setError(payload.error ?? gradingCopy.status.estimateFailedFallback);
          setStage("error");
          setGradeJobId(null);
          if (timer) clearInterval(timer);
        }
      } catch (pollError) {
        if (cancelled) return;
        setError(
          pollError instanceof Error
            ? pollError.message
            : gradingCopy.status.estimateFailedFallback
        );
        setStage("error");
        setGradeJobId(null);
        if (timer) clearInterval(timer);
      }
    };

    void poll();
    timer = setInterval(poll, 900);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [gradeJobId, identifiedCard, onComplete]);

  useEffect(() => {
    if (autoStartTimerRef.current) {
      clearTimeout(autoStartTimerRef.current);
      autoStartTimerRef.current = null;
    }

    if (!autoStartEnabled) {
      if (stage === "scheduled") {
        setStage("ready");
      }
      return;
    }

    if (stage !== "ready" || !canAnalyze) {
      return;
    }

    setStage("scheduled");
    autoStartTimerRef.current = setTimeout(() => {
      void startAnalysis();
    }, AUTO_START_DELAY_MS);

    return () => {
      if (autoStartTimerRef.current) {
        clearTimeout(autoStartTimerRef.current);
        autoStartTimerRef.current = null;
      }
    };
  }, [autoStartEnabled, canAnalyze, stage, startAnalysis]);

  useEffect(() => {
    return () => {
      if (autoStartTimerRef.current) {
        clearTimeout(autoStartTimerRef.current);
      }
    };
  }, []);

  return {
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
    maxPhotos,
  };
}
