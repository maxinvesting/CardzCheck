"use client";

import { useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { CardIdentificationResult } from "@/types";
import { normalizeIdentificationResult } from "@/lib/card-identity/result";
import { identifyCardFromImages } from "@/lib/identify-card/client";
import { normalizeHttpUrl, uniqueHttpUrls } from "@/lib/collection-images";

interface DualCardUploaderProps {
  onIdentified: (data: CardIdentificationResult) => void;
  disabled?: boolean;
  onStart?: () => void;
  onReset?: () => void;
}

const MAX_IDENTIFY_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_FALLBACK_DATA_URL_BYTES = 350 * 1024;

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
    tl: "top-2 left-2",
    tr: "top-2 right-2",
    bl: "bottom-2 left-2",
    br: "bottom-2 right-2",
  };
  return (
    <svg
      className={`absolute ${pos[corner]} w-5 h-5 transition-colors duration-200 ${
        active ? "text-blue-400" : "text-white/15"
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

// ── Single upload zone ─────────────────────────────────────────────────────
function UploadZone({
  label,
  sublabel,
  icon,
  preview,
  isDragging,
  disabled,
  onDrop,
  onDragOver,
  onDragLeave,
  onFileSelect,
  onRemove,
}: {
  label: string;
  sublabel: string;
  icon: React.ReactNode;
  preview: string | null;
  isDragging: boolean;
  disabled: boolean;
  onDrop: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onFileSelect: (file: File) => void;
  onRemove: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      className={`
        relative min-h-[180px] rounded-xl transition-all duration-200 flex-1
        ${isDragging
          ? "bg-blue-500/5 ring-1 ring-blue-400/30"
          : "bg-[#07111d] hover:bg-[#091529]"
        }
        ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
      `}
    >
      <CornerBracket corner="tl" active={isDragging || !!preview} />
      <CornerBracket corner="tr" active={isDragging || !!preview} />
      <CornerBracket corner="bl" active={isDragging || !!preview} />
      <CornerBracket corner="br" active={isDragging || !!preview} />

      {preview ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4">
          <img
            src={preview}
            alt={label}
            className="max-h-28 rounded-lg shadow-lg ring-1 ring-white/10 object-contain"
          />
          <span className="text-[10px] font-medium uppercase tracking-wider text-emerald-400">
            {label} ready
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="text-[10px] text-[#3a5068] hover:text-[#7a91a8] transition-colors"
          >
            Remove
          </button>
        </div>
      ) : (
        <label
          className={`absolute inset-0 flex flex-col items-center justify-center gap-2.5 p-5 ${
            disabled ? "" : "cursor-pointer"
          }`}
        >
          {icon}
          <div className="text-center space-y-0.5">
            <p className="text-sm font-medium text-[#e2eaf3]">
              {isDragging ? "Release to add" : label}
            </p>
            <p className="text-[11px] text-[#3a5068]">{sublabel}</p>
          </div>
          <p className="text-[9px] text-[#3a5068] uppercase tracking-wider">
            JPG · PNG · WebP · up to 8 MB
          </p>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            disabled={disabled}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onFileSelect(file);
              // Reset so re-selecting the same file fires onChange again
              if (inputRef.current) inputRef.current.value = "";
            }}
            className="hidden"
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
  const [frontDragging, setFrontDragging] = useState(false);
  const [backDragging, setBackDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bothReady = !!frontFile && !!backFile;

  const uploadFile = useCallback(
    async (file: File, fallbackDataUrl: string): Promise<string> => {
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
    },
    []
  );

  const validateFile = (file: File): string | null => {
    if (!file.type.startsWith("image/")) return "Please upload image files only";
    if (file.size > MAX_IDENTIFY_IMAGE_BYTES) return "Each image must be less than 8MB";
    return null;
  };

  const handleFrontFile = useCallback(async (file: File) => {
    const err = validateFile(file);
    if (err) { setError(err); return; }
    setError(null);
    const dataUrl = await readFileAsDataUrl(file);
    setFrontFile(file);
    setFrontPreview(dataUrl);
  }, []);

  const handleBackFile = useCallback(async (file: File) => {
    const err = validateFile(file);
    if (err) { setError(err); return; }
    setError(null);
    const dataUrl = await readFileAsDataUrl(file);
    setBackFile(file);
    setBackPreview(dataUrl);
  }, []);

  const handleAnalyze = useCallback(async () => {
    if (!frontFile || !backFile || !frontPreview || !backPreview) return;

    setError(null);
    onStart?.();
    setLoading(true);

    try {
      // Upload both images in parallel
      const [frontUrl, backUrl] = await Promise.all([
        uploadFile(frontFile, frontPreview),
        uploadFile(backFile, backPreview),
      ]);

      const imageUrls = [frontUrl, backUrl];
      const hasFallbackDataUrls = imageUrls.some(isDataUrl);
      const identifyInput =
        !hasFallbackDataUrls
          ? { imageUrls }
          : { imageUrl: frontUrl };

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
      const stockImageUrl = normalizeHttpUrl(result.stock_image_url || null);
      const ebayImageUrl = normalizeHttpUrl(result.ebay_image_url || null);
      const displayImageUrl =
        userImageUrl ||
        stockImageUrl ||
        ebayImageUrl ||
        imageUrls.find((url) => typeof url === "string" && url.trim().length > 0) ||
        "";

      if (result.card_identity?.warnings?.includes("parse_error")) {
        setError(
          "We couldn't read the card details clearly. Please confirm the year and set."
        );
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
          parallel_type:
            (result.card_identity?.parallel ?? result.variant) || undefined,
          imageUrl: displayImageUrl,
          imageUrls:
            sanitizedImageUrls.length > 0 ? sanitizedImageUrls : undefined,
          userImageUrl: userImageUrl || undefined,
          stockImageUrl: stockImageUrl || undefined,
          ebayImageUrl: ebayImageUrl || undefined,
          confidence: result.confidence,
          cardIdentity: result.card_identity,
        })
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to process image"
      );
      onReset?.();
    } finally {
      setLoading(false);
    }
  }, [frontFile, backFile, frontPreview, backPreview, onIdentified, onReset, onStart, uploadFile]);

  const handleReset = () => {
    setFrontFile(null);
    setBackFile(null);
    setFrontPreview(null);
    setBackPreview(null);
    setError(null);
  };

  const makeDrop =
    (handler: (file: File) => void, setDrag: (v: boolean) => void) =>
    (e: React.DragEvent) => {
      e.preventDefault();
      setDrag(false);
      const file = e.dataTransfer.files?.[0];
      if (file) handler(file);
    };

  const frontIcon = (
    <svg
      className="w-8 h-8 text-white/15"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.25}
        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
      />
    </svg>
  );

  const backIcon = (
    <svg
      className="w-8 h-8 text-white/15"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.25}
        d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
      />
    </svg>
  );

  if (loading) {
    return (
      <div className="w-full">
        <div className="relative min-h-[200px] rounded-xl bg-[#07111d] flex flex-col items-center justify-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-full border border-white/10" />
            <div className="absolute inset-0 w-10 h-10 rounded-full border-t-2 border-blue-500 animate-spin" />
          </div>
          <p className="text-sm text-[#7a91a8]">
            Analyzing front &amp; back photos...
          </p>
          <p className="text-[10px] text-[#3a5068]">
            Both images uploaded in parallel for faster results
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-3">
      {/* Two upload zones side by side */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <UploadZone
          label="Front of Card"
          sublabel="Required — drop or click to upload"
          icon={frontIcon}
          preview={frontPreview}
          isDragging={frontDragging}
          disabled={!!disabled}
          onDrop={makeDrop(handleFrontFile, setFrontDragging)}
          onDragOver={(e) => { e.preventDefault(); setFrontDragging(true); }}
          onDragLeave={(e) => { e.preventDefault(); setFrontDragging(false); }}
          onFileSelect={handleFrontFile}
          onRemove={() => { setFrontFile(null); setFrontPreview(null); }}
        />
        <UploadZone
          label="Back of Card"
          sublabel="Required — drop or click to upload"
          icon={backIcon}
          preview={backPreview}
          isDragging={backDragging}
          disabled={!!disabled}
          onDrop={makeDrop(handleBackFile, setBackDragging)}
          onDragOver={(e) => { e.preventDefault(); setBackDragging(true); }}
          onDragLeave={(e) => { e.preventDefault(); setBackDragging(false); }}
          onFileSelect={handleBackFile}
          onRemove={() => { setBackFile(null); setBackPreview(null); }}
        />
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between gap-3 px-1">
        <div className="flex items-center gap-2">
          <div
            className={`w-1.5 h-1.5 rounded-full ${
              frontFile ? "bg-emerald-400" : "bg-[#3a5068]"
            }`}
          />
          <span className="text-[10px] text-[#7a91a8]">Front</span>
          <div
            className={`w-1.5 h-1.5 rounded-full ${
              backFile ? "bg-emerald-400" : "bg-[#3a5068]"
            }`}
          />
          <span className="text-[10px] text-[#7a91a8]">Back</span>
        </div>

        {(frontFile || backFile) && (
          <button
            onClick={handleReset}
            className="text-[10px] text-[#3a5068] hover:text-[#7a91a8] transition-colors"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Analyze button */}
      <button
        onClick={handleAnalyze}
        disabled={!bothReady || !!disabled}
        className={`
          w-full py-3 rounded-xl text-sm font-medium transition-all duration-200
          ${bothReady && !disabled
            ? "bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/20"
            : "bg-[#0f1f35] text-[#3a5068] cursor-not-allowed"
          }
        `}
      >
        {bothReady ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            Scan &amp; Identify Card
          </span>
        ) : (
          <span>
            Upload both photos to scan ({frontFile ? "1" : "0"}/2)
          </span>
        )}
      </button>

      {/* Error */}
      {error && (
        <div className="p-3 bg-amber-500/5 border border-amber-500/15 rounded-lg">
          <p className="text-xs text-amber-300">{error}</p>
        </div>
      )}
    </div>
  );
}
