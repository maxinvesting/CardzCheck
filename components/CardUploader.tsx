"use client";

import { useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { CardIdentificationResponse, SearchFormData } from "@/types";

interface CardUploaderProps {
  onIdentified: (data: SearchFormData) => void;
  disabled?: boolean;
}

export default function CardUploader({ onIdentified, disabled }: CardUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("Please upload an image file");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError("Image must be less than 10MB");
      return;
    }

    setError(null);
    setLoading(true);

    // Show preview
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target?.result as string);
    reader.readAsDataURL(file);

    try {
      // Upload to Supabase Storage
      const supabase = createClient();
      const fileName = `${Date.now()}-${file.name}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("card-images")
        .upload(fileName, file);

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from("card-images")
        .getPublicUrl(uploadData.path);

      // Identify card from image
      const response = await fetch("/api/identify-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: publicUrl }),
      });

      const result: CardIdentificationResponse = await response.json();

      if ("error" in result) {
        setError(result.reason || result.error);
        return;
      }

      // Success - pass data to parent
      onIdentified({
        player_name: result.player_name,
        year: result.year || undefined,
        set_name: result.set_name || undefined,
        grade: result.grade || undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to process image");
    } finally {
      setLoading(false);
    }
  }, [onIdentified]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const reset = () => {
    setPreview(null);
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
            <p className="text-gray-600 dark:text-gray-400">Identifying card...</p>
          </div>
        ) : preview ? (
          <div className="flex flex-col items-center">
            <img
              src={preview}
              alt="Card preview"
              className="max-h-48 rounded-lg shadow-md mb-4"
            />
            <button
              onClick={reset}
              className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
            >
              Upload different image
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
              Upload card photo
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Drag & drop or click to select
            </p>
            <input
              type="file"
              accept="image/*"
              onChange={handleInputChange}
              disabled={disabled}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
            />
          </label>
        )}
      </div>

      {error && (
        <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
        </div>
      )}
    </div>
  );
}
