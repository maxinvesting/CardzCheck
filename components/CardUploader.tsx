"use client";

import { useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { CardIdentificationResult } from "@/types";
import { normalizeIdentificationResult } from "@/lib/card-identity/result";
import { identifyCardFromImages } from "@/lib/identify-card/client";
import { normalizeHttpUrl, uniqueHttpUrls } from "@/lib/collection-images";

interface CardUploaderProps {
  onIdentified: (data: CardIdentificationResult) => void;
  disabled?: boolean;
  maxFiles?: number;
  onStart?: () => void;
  onReset?: () => void;
  compact?: boolean;
}

const DEFAULT_MAX_FILES = 3;
const MAX_FALLBACK_DATA_URL_BYTES = 350 * 1024;
const MAX_IDENTIFY_IMAGE_BYTES = 8 * 1024 * 1024;

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
  const padding =
    base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
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

// ── Corner bracket decoration ──────────────────────────────────────────────
function CornerBracket({
  corner,
  active,
}: {
  corner: "tl" | "tr" | "bl" | "br";
  active: boolean;
}) {
  const paths: Record<string, string> = {
    tl: "M3 14 L3 3 L14 3",
    tr: "M10 3 L21 3 L21 14",
    bl: "M3 10 L3 21 L14 21",
    br: "M10 21 L21 21 L21 10",
  };
  const pos: Record<string, string> = {
    tl: "top-3 left-3",
    tr: "top-3 right-3",
    bl: "bottom-3 left-3",
    br: "bottom-3 right-3",
  };
  return (
    <svg
      className={`absolute ${pos[corner]} w-6 h-6 transition-colors duration-200 ${
        active ? "text-blue-400" : "text-white/20"
      }`}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d={paths[corner]}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function CardUploader({
  onIdentified,
  disabled,
  maxFiles = DEFAULT_MAX_FILES,
  onStart,
  onReset,
  compact = false,
}: CardUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [previews, setPreviews] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const uploadFile = useCallback(async (file: File, fallbackDataUrl: string): Promise<string> => {
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        throw new Error("Authentication required for storage uploads");
      }

      const fileName = `${user.id}/${Date.now()}-${file.name}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("card-images")
        .upload(fileName, file);

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      const { data: { publicUrl } } = supabase.storage
        .from("card-images")
        .getPublicUrl(uploadData.path);
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

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const incoming = Array.from(files);
    if (incoming.length === 0) return;

    const limit = Math.max(1, maxFiles);
    const selectedFiles = incoming.slice(0, limit);
    const limitExceeded = incoming.length > limit;

    for (const file of selectedFiles) {
      if (!file.type.startsWith("image/")) {
        setError("Please upload image files only");
        return;
      }
      if (file.size > MAX_IDENTIFY_IMAGE_BYTES) {
        setError("Each image must be less than 8MB");
        return;
      }
    }

    setError(limitExceeded ? `You can upload up to ${limit} photos at a time.` : null);
    onStart?.();
    setLoading(true);

    try {
      const previewDataUrls = await Promise.all(selectedFiles.map(readFileAsDataUrl));
      setPreviews(previewDataUrls);

      const imageUrls = await Promise.all(
        selectedFiles.map((file, index) => uploadFile(file, previewDataUrls[index]))
      );

      const primaryImageUrl = imageUrls[0];
      if (!primaryImageUrl) {
        throw new Error("Missing primary image");
      }

      const hasFallbackDataUrls = imageUrls.some(isDataUrl);
      const identifyInput =
        imageUrls.length > 1 && !hasFallbackDataUrls
          ? { imageUrls }
          : { imageUrl: primaryImageUrl };

      const identify = await identifyCardFromImages(identifyInput);
      if (!identify.ok || !identify.data || "error" in identify.data) {
        setError(identify.errorMessage || "Failed to process image");
        setLoading(false);
        onReset?.();
        return;
      }

      const result = identify.data;
      const sanitizedImageUrls = uniqueHttpUrls(imageUrls);
      const userImageUrl = normalizeHttpUrl(sanitizedImageUrls[0] || null);
      const displayImageUrl =
        userImageUrl ||
        imageUrls.find((url) => typeof url === "string" && url.trim().length > 0) ||
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
          imageUrls: sanitizedImageUrls.length > 0 ? sanitizedImageUrls : undefined,
          userImageUrl: userImageUrl || undefined,
          confidence: result.confidence,
          cardIdentity: result.card_identity,
        })
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to process image");
      onReset?.();
    } finally {
      setLoading(false);
    }
  }, [maxFiles, onIdentified, onReset, onStart, uploadFile]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files?.length) void handleFiles(files);
  }, [handleFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files?.length) void handleFiles(files);
  }, [handleFiles]);

  const reset = () => {
    setPreviews([]);
    setError(null);
  };

  const minHeight = compact ? "min-h-[140px]" : "min-h-[200px]";

  return (
    <div className="w-full">
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`
          relative ${minHeight} rounded-xl transition-all duration-200
          ${isDragging
            ? "bg-blue-500/5"
            : "bg-[#07111d] hover:bg-[#091529]"
          }
          ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
        `}
      >
        {/* Corner brackets */}
        <CornerBracket corner="tl" active={isDragging} />
        <CornerBracket corner="tr" active={isDragging} />
        <CornerBracket corner="bl" active={isDragging} />
        <CornerBracket corner="br" active={isDragging} />

        {loading ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <div className="relative">
              <div className="w-8 h-8 rounded-full border border-white/10" />
              <div className="absolute inset-0 w-8 h-8 rounded-full border-t border-blue-500 animate-spin" />
            </div>
            <p className="text-sm text-[#7a91a8]">Analyzing photos…</p>
          </div>
        ) : previews.length > 0 ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6">
            {maxFiles === 1 ? (
              <img
                src={previews[0]}
                alt="Card preview"
                className="max-h-40 rounded-lg shadow-lg ring-1 ring-white/10"
              />
            ) : (
              <>
                <div className="flex gap-2">
                  {previews.map((preview, index) => (
                    <div key={`${preview}-${index}`} className="relative">
                      <img
                        src={preview}
                        alt={`Card preview ${index + 1}`}
                        className={`h-20 w-14 object-cover rounded-md shadow-md ${
                          index === 0
                            ? "ring-1 ring-blue-400/60"
                            : "ring-1 ring-white/10"
                        }`}
                      />
                      {index === 0 ? (
                        <span className="absolute -top-1.5 -left-1.5 rounded-full bg-blue-500 text-white text-[9px] px-1.5 py-0.5 font-medium">
                          Front
                        </span>
                      ) : null}
                    </div>
                  ))}
                </div>
                <p className="text-xs text-[#7a91a8]">
                  {previews.length} of {maxFiles} photos ready
                </p>
              </>
            )}
            <button
              onClick={reset}
              className="text-xs text-[#3a5068] hover:text-[#7a91a8] transition-colors"
            >
              Upload different photos
            </button>
          </div>
        ) : (
          <label className={`absolute inset-0 flex flex-col items-center justify-center gap-3 ${compact ? "p-5" : "p-8"} ${disabled ? "" : "cursor-pointer"}`}>
            {/* Upload icon */}
            <svg
              className={`${compact ? "w-8 h-8" : "w-10 h-10"} text-white/20`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.25}
                d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
              />
            </svg>

            <div className="text-center space-y-1">
              <p className={`${compact ? "text-sm" : "text-base"} font-medium text-[#e2eaf3]`}>
                {isDragging ? "Release to scan" : "Upload photos to scan"}
              </p>
              <p className="text-xs text-[#3a5068]">
                or click to select · front + back recommended
              </p>
            </div>

            <p className="text-[10px] text-[#3a5068] uppercase tracking-wider">
              JPG · PNG · WebP &nbsp;·&nbsp; up to 8 MB
            </p>

            <input
              type="file"
              accept="image/*"
              multiple={maxFiles > 1}
              disabled={disabled}
              onChange={handleInputChange}
              className="hidden"
            />
          </label>
        )}
      </div>

      {error ? (
        <div className="mt-3 p-3 bg-amber-500/5 border border-amber-500/15 rounded-lg">
          <p className="text-xs text-amber-300">{error}</p>
        </div>
      ) : null}
    </div>
  );
}
