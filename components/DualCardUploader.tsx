"use client";

import { useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { CardIdentificationResult, GradeScanPhotoKind } from "@/types";
import { normalizeIdentificationResult } from "@/lib/card-identity/result";
import { identifyCardFromImages } from "@/lib/identify-card/client";
import { normalizeHttpUrl, uniqueHttpUrls } from "@/lib/collection-images";
import { normalizeGradeScanPhotos } from "@/lib/grading/scanPhotos";

interface DualCardUploaderProps {
  onIdentified: (data: CardIdentificationResult) => void;
  disabled?: boolean;
  onStart?: () => void;
  onReset?: () => void;
  /** When set, photos are ready but analysis stays blocked (e.g. missing card name) */
  analyzeGateHint?: string | null;
}

type PhotoTag = "auto" | "front" | "back" | "corner" | "edges" | "surface" | "other";

interface PhotoDraft {
  id: string;
  file: File;
  preview: string;
  tag: PhotoTag;
}

const TAG_OPTIONS: Array<{ value: PhotoTag; label: string }> = [
  { value: "auto", label: "Auto-detect" },
  { value: "front", label: "Front" },
  { value: "back", label: "Back" },
  { value: "corner", label: "Corner" },
  { value: "edges", label: "Edge" },
  { value: "surface", label: "Surface" },
  { value: "other", label: "Other" },
];

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_FALLBACK_DATA_URL_BYTES = 350 * 1024;

function tagToKind(tag: PhotoTag): GradeScanPhotoKind {
  switch (tag) {
    case "front": return "front";
    case "back": return "back";
    case "corner": return "corner_tl";
    case "edges": return "edges";
    case "surface": return "surface";
    default: return "other";
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
      if (!ctx) { resolve(null); return; }
      ctx.drawImage(image, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", options.quality));
    };
    image.onerror = () => resolve(null);
    image.src = dataUrl;
  });
}

export default function DualCardUploader({
  onIdentified,
  disabled,
  onStart,
  onReset,
  analyzeGateHint,
}: DualCardUploaderProps) {
  const [photos, setPhotos] = useState<PhotoDraft[]>([]);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const canAnalyze = photos.length >= 2;

  const validateFile = useCallback((file: File): string | null => {
    if (!file.type.startsWith("image/")) return "Please upload image files only.";
    if (file.size > MAX_IMAGE_BYTES) return "Each image must be less than 8MB.";
    return null;
  }, []);

  const addFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      for (const file of files) {
        const err = validateFile(file);
        if (err) { setError(err); return; }
      }
      setError(null);
      const previews = await Promise.all(files.map((f) => readFileAsDataUrl(f)));
      setPhotos((prev) => {
        const startIndex = prev.length;
        const next = files.map((file, i): PhotoDraft => ({
          id: `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}`,
          file,
          preview: previews[i],
          tag: defaultTagForIndex(startIndex + i),
        }));
        return [...prev, ...next];
      });
    },
    [validateFile]
  );

  const uploadFile = useCallback(async (file: File, fallbackDataUrl: string): Promise<string> => {
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Authentication required for storage uploads");
      const fileName = `${user.id}/${Date.now()}-${file.name}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("card-images")
        .upload(fileName, file);
      if (uploadError) throw new Error(uploadError.message);
      const { data: { publicUrl } } = supabase.storage.from("card-images").getPublicUrl(uploadData.path);
      return publicUrl;
    } catch {
      const fallbackBytes = estimateDataUrlByteLength(fallbackDataUrl);
      if (fallbackBytes <= MAX_FALLBACK_DATA_URL_BYTES) return fallbackDataUrl;
      const compressed = await compressDataUrl(fallbackDataUrl, { maxWidth: 1200, maxHeight: 1200, quality: 0.72 });
      return compressed || fallbackDataUrl;
    }
  }, []);

  const handleAnalyze = useCallback(async () => {
    if (photos.length < 2) return;
    setError(null);
    onStart?.();
    setLoading(true);

    try {
      const uploadedUrls = await Promise.all(
        photos.map((p) => uploadFile(p.file, p.preview))
      );

      const scanPhotos = normalizeGradeScanPhotos(
        photos.map((p, i) => ({
          url: uploadedUrls[i],
          kind: tagToKind(p.tag),
          sort_order: i,
        }))
      );

      // Find front/back URLs for identification — prefer tagged, fall back to first two
      const frontIdx = photos.findIndex((p) => p.tag === "front");
      const backIdx = photos.findIndex((p) => p.tag === "back");
      const frontUrl = uploadedUrls[frontIdx >= 0 ? frontIdx : 0] ?? uploadedUrls[0];
      const backUrl = uploadedUrls[backIdx >= 0 ? backIdx : 1] ?? uploadedUrls[1];

      const identifyInput = [frontUrl, backUrl].some(isDataUrl)
        ? { imageUrl: frontUrl }
        : { imageUrls: [frontUrl, backUrl] };

      const identify = await identifyCardFromImages(identifyInput);
      if (!identify.ok || !identify.data || "error" in identify.data) {
        setError(identify.errorMessage || "Failed to process image.");
        setLoading(false);
        onReset?.();
        return;
      }

      const result = identify.data;
      const allImageUrls = scanPhotos
        .map((photo) => photo.url)
        .filter((url) => typeof url === "string" && url.trim().length > 0);
      const sanitizedImageUrls = uniqueHttpUrls(allImageUrls);
      const userImageUrl = normalizeHttpUrl(frontUrl) || normalizeHttpUrl(sanitizedImageUrls[0] || null);
      const displayImageUrl =
        userImageUrl ||
        allImageUrls.find((url) => typeof url === "string" && url.trim().length > 0) ||
        "";

      if (result.card_identity?.warnings?.includes("parse_error")) {
        setError("We couldn't read the card details clearly. Please confirm the year and set.");
      } else if (result.confidence === "low") {
        setError(
          `Card identified with low confidence. Player: ${result.player_name || "Unknown"}. Please verify the details manually.`
        );
      }

      onIdentified(
        normalizeIdentificationResult({
          player_name: result.player_name,
          players: result.players || [result.player_name],
          year: result.year || undefined,
          set_name: result.set_name || undefined,
          insert: result.insert || undefined,
          grade: result.grade || undefined,
          parallel_type: (result.card_identity?.parallel ?? result.variant) || undefined,
          imageUrl: displayImageUrl,
          imageUrls: allImageUrls,
          scanPhotos,
          userImageUrl: userImageUrl || undefined,
          confidence: result.confidence,
          cardIdentity: result.card_identity,
        })
      );
    } catch (analyzeError) {
      setError(analyzeError instanceof Error ? analyzeError.message : "Failed to process image.");
      onReset?.();
    } finally {
      setLoading(false);
    }
  }, [photos, onStart, uploadFile, onIdentified, onReset]);

  if (loading) {
    return (
      <div className="w-full">
        <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-xl border border-slate-700 bg-slate-800/50">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-slate-600 border-t-slate-300" />
          <p className="text-sm text-slate-300">Analyzing {photos.length} photo{photos.length === 1 ? "" : "s"}...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-4">
      {/* Header */}
      <div>
        <p className="text-sm font-semibold text-slate-100">Upload your photos</p>
        <p className="mt-0.5 text-xs text-slate-400">
          Front and back required — the more photos you include, the more accurate your grade prediction.
        </p>
      </div>

      {/* Drop zone */}
      <div
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void addFiles(Array.from(e.dataTransfer.files ?? []));
        }}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={(e) => { e.preventDefault(); setDragging(false); }}
        onClick={() => !disabled && inputRef.current?.click()}
        className={`relative cursor-pointer rounded-xl border border-dashed p-6 text-center transition-colors ${
          dragging
            ? "border-slate-400 bg-slate-700/50"
            : "border-slate-600 bg-slate-800/30 hover:border-slate-500 hover:bg-slate-800/50"
        } ${disabled ? "pointer-events-none opacity-50" : ""}`}
      >
        <div className="flex flex-col items-center gap-2">
          <svg className="h-8 w-8 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <p className="text-sm font-medium text-slate-300">
            {dragging ? "Drop photos here" : "Drop photos or click to select"}
          </p>
          <p className="text-xs text-slate-500">JPG · PNG · WebP · up to 8 MB each</p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          disabled={disabled}
          className="hidden"
          onChange={(e) => {
            void addFiles(Array.from(e.target.files ?? []));
            e.currentTarget.value = "";
          }}
        />
      </div>

      {/* Photo count + thumbnails */}
      {photos.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-slate-400">
              {photos.length} photo{photos.length === 1 ? "" : "s"} selected
            </p>
            <button
              type="button"
              onClick={() => { setPhotos([]); setError(null); }}
              className="text-xs text-slate-500 underline-offset-2 transition-colors hover:text-slate-300 hover:underline"
            >
              Clear all
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {photos.map((photo, index) => (
              <div key={photo.id} className="rounded-lg border border-slate-700 bg-slate-800/60 p-1.5">
                <div className="relative">
                  <img
                    src={photo.preview}
                    alt={`Photo ${index + 1}`}
                    className="h-20 w-full rounded-md object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => setPhotos((prev) => prev.filter((p) => p.id !== photo.id))}
                    className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-slate-900/80 text-slate-300 transition-colors hover:bg-slate-900 hover:text-white"
                    aria-label="Remove photo"
                  >
                    <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <select
                  value={photo.tag}
                  onChange={(e) => {
                    const tag = e.target.value as PhotoTag;
                    setPhotos((prev) =>
                      prev.map((p) => (p.id === photo.id ? { ...p, tag } : p))
                    );
                  }}
                  className="mt-1.5 w-full rounded border border-slate-600 bg-slate-700 px-1.5 py-1 text-[11px] text-slate-200 focus:outline-none focus:ring-1 focus:ring-slate-500"
                >
                  {TAG_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Continue button */}
      <button
        type="button"
        onClick={() => { void handleAnalyze(); }}
        disabled={!canAnalyze || Boolean(disabled) || Boolean(analyzeGateHint)}
        className={`w-full rounded-xl border py-3 text-sm font-semibold transition-colors ${
          canAnalyze && !disabled && !analyzeGateHint
            ? "border-slate-900 bg-slate-900 text-white hover:bg-slate-800"
            : "cursor-not-allowed border-slate-700 bg-slate-800/50 text-slate-500"
        }`}
      >
        {!canAnalyze
          ? "Add front + back photos to continue"
          : analyzeGateHint
            ? analyzeGateHint
            : `Analyze ${photos.length} photo${photos.length === 1 ? "" : "s"} →`}
      </button>

      {error ? (
        <div className="rounded-lg border border-amber-800/50 bg-amber-900/20 p-3">
          <p className="text-xs text-amber-400">{error}</p>
        </div>
      ) : null}
    </div>
  );
}
