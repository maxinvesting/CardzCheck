"use client";

import { useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { CardIdentificationResponse, CardIdentificationResult } from "@/types";
import { normalizeIdentificationResult } from "@/lib/card-identity/result";

interface CardUploaderProps {
  onIdentified: (data: CardIdentificationResult) => void;
  disabled?: boolean;
  maxFiles?: number;
  onStart?: () => void;
  onReset?: () => void;
}

const DEFAULT_MAX_FILES = 3; // Allow front, back, and one detail shot

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function CardUploader({
  onIdentified,
  disabled,
  maxFiles = DEFAULT_MAX_FILES,
  onStart,
  onReset,
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
      return fallbackDataUrl;
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
      if (file.size > 10 * 1024 * 1024) {
        setError("Each image must be less than 10MB");
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

      // Process card image (accepts both URL and base64 data URL)
      const response = await fetch("/api/identify-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          imageUrls.length > 1
            ? { imageUrls }
            : { imageUrl: primaryImageUrl }
        ),
      });

      const result: CardIdentificationResponse = await response.json();

      if ("error" in result) {
        setError(result.reason || result.error);
        setLoading(false);
        onReset?.();
        return;
      }

      // Check confidence level / parse errors
      if (result.card_identity?.warnings?.includes("parse_error")) {
        setError("We couldn't read the card details clearly. Please confirm the year and set.");
      } else if (result.confidence === "low") {
        setError(
          `Card identified with low confidence. Player: ${result.player_name || "Unknown"}. Please verify the details manually.`
        );
      }

      // Success - pass data to parent with image URLs (NO grade estimate - that's separate)
      onIdentified(
        normalizeIdentificationResult({
        player_name: result.player_name,
        players: result.players || [result.player_name],
        year: result.year || undefined,
        set_name: result.set_name || undefined,
        insert: result.insert || undefined,
        grade: result.grade || undefined,
        parallel_type: (result.card_identity?.parallel ?? result.variant) || undefined,
        imageUrl: primaryImageUrl,
        imageUrls,
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
    if (files?.length) handleFiles(files);
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
    if (files?.length) handleFiles(files);
  }, [handleFiles]);

  const reset = () => {
    setPreviews([]);
    setError(null);
  };

  return (
    <div className="w-full">
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`
          relative border-2 border-dashed rounded-xl p-8 text-center transition-all
          ${isDragging
            ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
            : "border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600"
          }
          ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
        `}
      >
        {loading ? (
          <div className="flex flex-col items-center py-4">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mb-4"></div>
            <p className="text-gray-600 dark:text-gray-400">Processing card...</p>
          </div>
        ) : previews.length > 0 ? (
          <div className="flex flex-col items-center gap-3">
            {maxFiles === 1 ? (
              <img
                src={previews[0]}
                alt="Card preview"
                className="max-h-48 rounded-lg shadow-md"
              />
            ) : (
              <>
                <div className="grid grid-cols-4 gap-2">
                  {previews.map((preview, index) => (
                    <div key={`${preview}-${index}`} className="relative">
                      <img
                        src={preview}
                        alt={`Card preview ${index + 1}`}
                        className={`h-16 w-12 object-cover rounded-md shadow-sm ${
                          index === 0 ? "ring-2 ring-blue-500" : ""
                        }`}
                      />
                      {index === 0 ? (
                        <span className="absolute -top-2 -left-2 rounded-full bg-blue-600 text-white text-[10px] px-1.5 py-0.5">
                          Primary
                        </span>
                      ) : null}
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {previews.length}/{maxFiles} photos uploaded. Primary photo is used for identification.
                </p>
              </>
            )}
            <button
              onClick={reset}
              className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
            >
              Upload different {maxFiles === 1 ? "image" : "photos"}
            </button>
          </div>
        ) : (
          <label className={`flex flex-col items-center ${disabled ? "" : "cursor-pointer"}`}>
            <svg
              className="w-12 h-12 text-gray-400 mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            <p className="text-lg font-medium text-gray-700 dark:text-gray-300 mb-1">
              {maxFiles === 1 ? "Upload card photo" : `Upload card photos (up to ${maxFiles})`}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Drag & drop or click to select
            </p>
            <input
              type="file"
              accept="image/*"
              multiple={maxFiles > 1}
              onChange={handleInputChange}
              disabled={disabled}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
            />
          </label>
        )}
      </div>

      {error && (
        <div className="mt-4 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
          <div className="flex items-start gap-3">
            <svg
              className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300 mb-1">
                Card Processing Issue
              </p>
              <p className="text-sm text-amber-700 dark:text-amber-400">{error}</p>
              <p className="text-xs text-amber-600 dark:text-amber-500 mt-2">
                Tip: Try using the manual search form below, or upload a clearer image with better lighting.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
