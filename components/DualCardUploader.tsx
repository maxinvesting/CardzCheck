"use client";

import { useState, useCallback, useMemo, useRef, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import type { CardIdentificationResult, GradeScanPhoto, GradeScanPhotoKind } from "@/types";
import { normalizeIdentificationResult } from "@/lib/card-identity/result";
import { identifyCardFromImages } from "@/lib/identify-card/client";
import { normalizeHttpUrl, uniqueHttpUrls } from "@/lib/collection-images";
import {
  GRADE_SCAN_CLOSEUP_KINDS,
  GRADE_SCAN_KIND_LABELS,
  GRADE_SCAN_MAX_CLOSEUPS,
  GRADE_SCAN_MAX_TOTAL_PHOTOS,
  normalizeGradeScanPhotos,
} from "@/lib/grading/scanPhotos";

interface DualCardUploaderProps {
  onIdentified: (data: CardIdentificationResult) => void;
  disabled?: boolean;
  onStart?: () => void;
  onReset?: () => void;
}

const MAX_IDENTIFY_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_FALLBACK_DATA_URL_BYTES = 350 * 1024;

const QUICK_TAG_CHIPS: Array<{ label: string; kind: GradeScanPhotoKind }> = [
  { label: "Add Top Left Corner", kind: "corner_tl" },
  { label: "Add Top Right Corner", kind: "corner_tr" },
  { label: "Add Bottom Left Corner", kind: "corner_bl" },
  { label: "Add Bottom Right Corner", kind: "corner_br" },
  { label: "Add Edges", kind: "edges" },
  { label: "Add Surface", kind: "surface" },
];

type CloseupDraft = {
  id: string;
  file: File;
  preview: string;
  kind: GradeScanPhotoKind;
};

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
      const scale = Math.min(
        1,
        options.maxWidth / image.width,
        options.maxHeight / image.height
      );
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

function UploadZone({
  label,
  sublabel,
  preview,
  disabled,
  dragging,
  icon,
  onDrop,
  onDragOver,
  onDragLeave,
  onFileSelect,
  onRemove,
}: {
  label: string;
  sublabel: string;
  preview: string | null;
  disabled: boolean;
  dragging: boolean;
  icon: ReactNode;
  onDrop: (event: React.DragEvent) => void;
  onDragOver: (event: React.DragEvent) => void;
  onDragLeave: (event: React.DragEvent) => void;
  onFileSelect: (file: File) => void;
  onRemove: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      className={`relative min-h-[190px] rounded-xl border border-dashed p-3 transition-colors ${
        dragging
          ? "border-slate-500 bg-slate-50"
          : "border-slate-300 bg-white hover:border-slate-400"
      } ${disabled ? "opacity-60" : ""}`}
    >
      {preview ? (
        <div className="flex h-full flex-col items-center justify-center gap-2.5 rounded-lg border border-slate-200 bg-white p-3">
          <img src={preview} alt={label} className="max-h-28 rounded-md object-contain" />
          <p className="text-xs font-medium text-slate-700">{label} ready</p>
          <button
            type="button"
            onClick={onRemove}
            className="text-xs text-slate-500 underline-offset-2 transition-colors hover:text-slate-700 hover:underline"
          >
            Remove
          </button>
        </div>
      ) : (
        <label
          className={`flex h-full cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white p-4 text-center ${
            disabled ? "pointer-events-none cursor-not-allowed" : ""
          }`}
        >
          <div className="text-slate-500">{icon}</div>
          <p className="text-base font-semibold text-slate-900">{dragging ? "Drop photo" : label}</p>
          <p className="text-xs text-slate-500">{sublabel}</p>
          <p className="text-[11px] text-slate-400">JPG · PNG · WebP · up to 8 MB</p>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            disabled={disabled}
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onFileSelect(file);
              if (inputRef.current) inputRef.current.value = "";
            }}
          />
        </label>
      )}
    </div>
  );
}

export default function DualCardUploader({
  onIdentified,
  disabled,
  onStart,
  onReset,
}: DualCardUploaderProps) {
  const [frontPreview, setFrontPreview] = useState<string | null>(null);
  const [backPreview, setBackPreview] = useState<string | null>(null);
  const [frontFile, setFrontFile] = useState<File | null>(null);
  const [backFile, setBackFile] = useState<File | null>(null);
  const [closeups, setCloseups] = useState<CloseupDraft[]>([]);
  const [frontDragging, setFrontDragging] = useState(false);
  const [backDragging, setBackDragging] = useState(false);
  const [closeupDragging, setCloseupDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quickAddKind, setQuickAddKind] = useState<GradeScanPhotoKind>("other");

  const closeupInputRef = useRef<HTMLInputElement>(null);
  const quickAddInputRef = useRef<HTMLInputElement>(null);

  const totalPhotos = (frontFile ? 1 : 0) + (backFile ? 1 : 0) + closeups.length;
  const closeupSlotsRemaining = Math.max(0, GRADE_SCAN_MAX_CLOSEUPS - closeups.length);
  const canAnalyze = Boolean(frontFile && backFile);

  const uploadFile = useCallback(async (file: File, fallbackDataUrl: string): Promise<string> => {
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        throw new Error("Authentication required for storage uploads");
      }

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
      if (fallbackBytes <= MAX_FALLBACK_DATA_URL_BYTES) {
        return fallbackDataUrl;
      }
      const compressed = await compressDataUrl(fallbackDataUrl, {
        maxWidth: 1200,
        maxHeight: 1200,
        quality: 0.72,
      });
      return compressed || fallbackDataUrl;
    }
  }, []);

  const validateFile = useCallback((file: File): string | null => {
    if (!file.type.startsWith("image/")) return "Please upload image files only.";
    if (file.size > MAX_IDENTIFY_IMAGE_BYTES) return "Each image must be less than 8MB.";
    return null;
  }, []);

  const handleFrontFile = useCallback(
    async (file: File) => {
      const validationError = validateFile(file);
      if (validationError) {
        setError(validationError);
        return;
      }
      const dataUrl = await readFileAsDataUrl(file);
      setFrontFile(file);
      setFrontPreview(dataUrl);
      setError(null);
    },
    [validateFile]
  );

  const handleBackFile = useCallback(
    async (file: File) => {
      const validationError = validateFile(file);
      if (validationError) {
        setError(validationError);
        return;
      }
      const dataUrl = await readFileAsDataUrl(file);
      setBackFile(file);
      setBackPreview(dataUrl);
      setError(null);
    },
    [validateFile]
  );

  const addCloseupFiles = useCallback(
    async (files: File[], defaultKind: GradeScanPhotoKind) => {
      if (files.length === 0) return;
      const validated: File[] = [];
      for (const file of files) {
        const validationError = validateFile(file);
        if (validationError) {
          setError(validationError);
          return;
        }
        validated.push(file);
      }

      const allowedByCloseups = Math.max(0, GRADE_SCAN_MAX_CLOSEUPS - closeups.length);
      const allowedByTotal = Math.max(0, GRADE_SCAN_MAX_TOTAL_PHOTOS - (frontFile ? 1 : 0) - (backFile ? 1 : 0) - closeups.length);
      const allowed = Math.min(allowedByCloseups, allowedByTotal);

      if (allowed <= 0) {
        setError(`You can upload up to ${GRADE_SCAN_MAX_TOTAL_PHOTOS} total photos.`);
        return;
      }

      const accepted = validated.slice(0, allowed);
      if (accepted.length < validated.length) {
        setError(`Only ${allowed} close-up photo${allowed === 1 ? "" : "s"} could be added. Maximum is ${GRADE_SCAN_MAX_CLOSEUPS} close-ups (${GRADE_SCAN_MAX_TOTAL_PHOTOS} total).`);
      } else {
        setError(null);
      }

      const previews = await Promise.all(accepted.map((file) => readFileAsDataUrl(file)));
      const nextItems = accepted.map((file, index): CloseupDraft => ({
        id: `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        preview: previews[index],
        kind: defaultKind,
      }));

      setCloseups((prev) => [...prev, ...nextItems]);
    },
    [backFile, closeups.length, frontFile, validateFile]
  );

  const handleCloseupDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      setCloseupDragging(false);
      const files = Array.from(event.dataTransfer.files ?? []);
      void addCloseupFiles(files, "other");
    },
    [addCloseupFiles]
  );

  const handleAnalyze = useCallback(async () => {
    if (!frontFile || !backFile || !frontPreview || !backPreview) return;

    setError(null);
    onStart?.();
    setLoading(true);

    try {
      const uploads = [
        uploadFile(frontFile, frontPreview),
        uploadFile(backFile, backPreview),
        ...closeups.map((closeup) => uploadFile(closeup.file, closeup.preview)),
      ];
      const uploadedUrls = await Promise.all(uploads);

      const frontUrl = uploadedUrls[0];
      const backUrl = uploadedUrls[1];
      const closeupUrls = uploadedUrls.slice(2);

      const scanPhotos = normalizeGradeScanPhotos([
        { url: frontUrl, kind: "front", sort_order: 0 },
        { url: backUrl, kind: "back", sort_order: 1 },
        ...closeups.map((closeup, index) => ({
          url: closeupUrls[index],
          kind: closeup.kind,
          sort_order: index + 2,
        })),
      ]);

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
      const stockImageUrl = normalizeHttpUrl(result.stock_image_url || null);
      const ebayImageUrl = normalizeHttpUrl(result.ebay_image_url || null);
      const displayImageUrl =
        userImageUrl ||
        stockImageUrl ||
        ebayImageUrl ||
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
          stockImageUrl: stockImageUrl || undefined,
          ebayImageUrl: ebayImageUrl || undefined,
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
  }, [backFile, backPreview, closeups, frontFile, frontPreview, onIdentified, onReset, onStart, uploadFile]);

  const handleReset = useCallback(() => {
    setFrontFile(null);
    setBackFile(null);
    setFrontPreview(null);
    setBackPreview(null);
    setCloseups([]);
    setError(null);
  }, []);

  const allTiles = useMemo(() => {
    const items: Array<
      | { id: string; kind: "required"; label: string; preview: string; remove: () => void }
      | {
          id: string;
          kind: "closeup";
          label: string;
          preview: string;
          closeupKind: GradeScanPhotoKind;
          remove: () => void;
          updateKind: (kind: GradeScanPhotoKind) => void;
        }
    > = [];

    if (frontPreview) {
      items.push({
        id: "front",
        kind: "required",
        label: "Front",
        preview: frontPreview,
        remove: () => {
          setFrontFile(null);
          setFrontPreview(null);
        },
      });
    }

    if (backPreview) {
      items.push({
        id: "back",
        kind: "required",
        label: "Back",
        preview: backPreview,
        remove: () => {
          setBackFile(null);
          setBackPreview(null);
        },
      });
    }

    closeups.forEach((closeup) => {
      items.push({
        id: closeup.id,
        kind: "closeup",
        label: "Close-up",
        preview: closeup.preview,
        closeupKind: closeup.kind,
        remove: () => {
          setCloseups((prev) => prev.filter((item) => item.id !== closeup.id));
        },
        updateKind: (kind) => {
          setCloseups((prev) =>
            prev.map((item) => (item.id === closeup.id ? { ...item, kind } : item))
          );
        },
      });
    });

    return items;
  }, [backPreview, closeups, frontPreview]);

  if (loading) {
    return (
      <div className="w-full">
        <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-xl border border-slate-300 bg-white">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" />
          <p className="text-sm text-slate-600">Uploading and analyzing photos...</p>
          <p className="text-xs text-slate-500">
            Front, back, and {closeups.length} close-up photo{closeups.length === 1 ? "" : "s"}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <UploadZone
          label="Front of Card"
          sublabel="Required - drop or click to upload"
          preview={frontPreview}
          dragging={frontDragging}
          disabled={Boolean(disabled)}
          icon={
            <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          }
          onDrop={(event) => {
            event.preventDefault();
            setFrontDragging(false);
            const file = event.dataTransfer.files?.[0];
            if (file) void handleFrontFile(file);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setFrontDragging(true);
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            setFrontDragging(false);
          }}
          onFileSelect={(file) => {
            void handleFrontFile(file);
          }}
          onRemove={() => {
            setFrontFile(null);
            setFrontPreview(null);
          }}
        />

        <UploadZone
          label="Back of Card"
          sublabel="Required - drop or click to upload"
          preview={backPreview}
          dragging={backDragging}
          disabled={Boolean(disabled)}
          icon={
            <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
              />
            </svg>
          }
          onDrop={(event) => {
            event.preventDefault();
            setBackDragging(false);
            const file = event.dataTransfer.files?.[0];
            if (file) void handleBackFile(file);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setBackDragging(true);
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            setBackDragging(false);
          }}
          onFileSelect={(file) => {
            void handleBackFile(file);
          }}
          onRemove={() => {
            setBackFile(null);
            setBackPreview(null);
          }}
        />
      </div>

      <section className="rounded-xl border border-slate-300 bg-white p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-900">
            Optional close-ups ({closeups.length}/{GRADE_SCAN_MAX_CLOSEUPS})
          </h3>
          <p className="text-xs text-slate-500">Total photos: {totalPhotos}/{GRADE_SCAN_MAX_TOTAL_PHOTOS}</p>
        </div>

        <div className="mb-3 flex flex-wrap gap-2">
          {QUICK_TAG_CHIPS.map((chip) => (
            <button
              key={chip.kind}
              type="button"
              disabled={Boolean(disabled) || closeupSlotsRemaining <= 0}
              className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => {
                setQuickAddKind(chip.kind);
                quickAddInputRef.current?.click();
              }}
            >
              {chip.label}
            </button>
          ))}
          <input
            ref={quickAddInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              void addCloseupFiles(files, quickAddKind);
              event.currentTarget.value = "";
            }}
          />
        </div>

        <div
          onDrop={handleCloseupDrop}
          onDragOver={(event) => {
            event.preventDefault();
            setCloseupDragging(true);
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            setCloseupDragging(false);
          }}
          className={`rounded-lg border border-dashed p-4 text-center transition-colors ${
            closeupDragging
              ? "border-slate-500 bg-slate-50"
              : "border-slate-300 bg-slate-50/60"
          }`}
        >
          <p className="text-sm font-medium text-slate-800">
            Drag and drop close-up photos, or click to select
          </p>
          <p className="mt-1 text-xs text-slate-500">Tag each close-up as corners, edges, surface, or other.</p>
          <button
            type="button"
            disabled={Boolean(disabled) || closeupSlotsRemaining <= 0}
            onClick={() => closeupInputRef.current?.click()}
            className="mt-3 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Add close-up photos
          </button>
          <input
            ref={closeupInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              void addCloseupFiles(files, "other");
              event.currentTarget.value = "";
            }}
          />
        </div>
      </section>

      {allTiles.length > 0 ? (
        <section className="rounded-xl border border-slate-300 bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-900">Uploaded Photos</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {allTiles.map((tile) => (
              <div key={tile.id} className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                <img src={tile.preview} alt={tile.label} className="h-28 w-full rounded-md object-cover" />
                <div className="mt-2 space-y-1">
                  <p className="truncate text-[11px] font-medium text-slate-700">{tile.label}</p>
                  {tile.kind === "closeup" ? (
                    <select
                      value={tile.closeupKind}
                      className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-700"
                      onChange={(event) => {
                        tile.updateKind(event.target.value as GradeScanPhotoKind);
                      }}
                    >
                      {GRADE_SCAN_CLOSEUP_KINDS.map((kind) => (
                        <option key={kind} value={kind}>
                          {GRADE_SCAN_KIND_LABELS[kind]}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <p className="text-[11px] text-slate-500">Required</p>
                  )}
                  <button
                    type="button"
                    onClick={tile.remove}
                    className="text-[11px] text-slate-500 underline-offset-2 transition-colors hover:text-slate-700 hover:underline"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span className={`h-2 w-2 rounded-full ${frontFile ? "bg-emerald-500" : "bg-slate-300"}`} />
          Front
          <span className={`h-2 w-2 rounded-full ${backFile ? "bg-emerald-500" : "bg-slate-300"}`} />
          Back
          <span className={`h-2 w-2 rounded-full ${closeups.length > 0 ? "bg-emerald-500" : "bg-slate-300"}`} />
          Close-ups ({closeups.length})
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={Boolean(disabled) || closeupSlotsRemaining <= 0}
            onClick={() => closeupInputRef.current?.click()}
            className="text-xs font-medium text-slate-600 underline-offset-2 transition-colors hover:text-slate-800 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
          >
            Add close-up photos
          </button>

          {totalPhotos > 0 ? (
            <button
              type="button"
              onClick={handleReset}
              className="text-xs text-slate-500 underline-offset-2 transition-colors hover:text-slate-700 hover:underline"
            >
              Clear all
            </button>
          ) : null}
        </div>
      </div>

      {canAnalyze && closeups.length === 0 ? (
        <p className="px-1 text-xs text-slate-500">
          Optional: add close-up photos for corners, edges, and surface before scanning.
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => {
          void handleAnalyze();
        }}
        disabled={!canAnalyze || Boolean(disabled)}
        className={`w-full rounded-xl border py-3 text-sm font-semibold transition-colors ${
          canAnalyze && !disabled
            ? "border-slate-900 bg-slate-900 text-white hover:bg-slate-800"
            : "cursor-not-allowed border-slate-300 bg-slate-100 text-slate-500"
        }`}
      >
        {canAnalyze
          ? `Scan and Identify (${totalPhotos}/${GRADE_SCAN_MAX_TOTAL_PHOTOS} photos)`
          : "Upload front + back photos to continue"}
      </button>

      {error ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs text-amber-700">{error}</p>
        </div>
      ) : null}
    </div>
  );
}
