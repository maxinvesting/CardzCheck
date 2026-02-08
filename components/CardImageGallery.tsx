"use client";

import { useState, useRef } from "react";
import { CardImage } from "@/types";

interface CardImageGalleryProps {
  cardId: string;
  images: CardImage[];
  onImagesChange: (images: CardImage[]) => void;
}

export default function CardImageGallery({
  cardId,
  images,
  onImagesChange,
}: CardImageGalleryProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedImage = images[selectedIndex];
  const isLegacyImage = (img: CardImage) => img.id.startsWith("legacy-");

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setUploading(true);
    const formData = new FormData();
    Array.from(files).forEach((file) => {
      formData.append("files", file);
    });

    try {
      const response = await fetch(`/api/cards/${cardId}/images`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Upload failed");
      }

      const { images: newImages } = await response.json();
      onImagesChange([...images, ...newImages]);
    } catch (error) {
      console.error("Upload error:", error);
      alert("Failed to upload images. Please try again.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleDelete = async (imageId: string) => {
    if (!confirm("Are you sure you want to delete this image?")) return;

    setDeleting(imageId);

    try {
      const response = await fetch(
        `/api/cards/${cardId}/images?imageId=${imageId}`,
        {
          method: "DELETE",
        }
      );

      if (!response.ok) {
        throw new Error("Delete failed");
      }

      const newImages = images.filter((img) => img.id !== imageId);
      onImagesChange(newImages);

      // Adjust selected index if needed
      if (selectedIndex >= newImages.length && newImages.length > 0) {
        setSelectedIndex(newImages.length - 1);
      }
    } catch (error) {
      console.error("Delete error:", error);
      alert("Failed to delete image. Please try again.");
    } finally {
      setDeleting(null);
    }
  };

  const handleSetPrimary = async (imageId: string) => {
    const targetIndex = images.findIndex((img) => img.id === imageId);
    if (targetIndex === -1) return;

    // Reorder: move target to position 0, shift others down
    const reordered = [...images];
    const [movedImage] = reordered.splice(targetIndex, 1);
    reordered.unshift(movedImage);

    // Update positions
    const imageOrders = reordered.map((img, idx) => ({
      id: img.id,
      position: idx,
    }));

    try {
      const response = await fetch(`/api/cards/${cardId}/images`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageOrders }),
      });

      if (!response.ok) {
        throw new Error("Reorder failed");
      }

      const { images: updatedImages } = await response.json();
      onImagesChange(updatedImages);
      setSelectedIndex(0);
    } catch (error) {
      console.error("Reorder error:", error);
      alert("Failed to reorder images. Please try again.");
    }
  };

  const handleMoveLeft = async (index: number) => {
    if (index <= 0) return;

    const reordered = [...images];
    [reordered[index - 1], reordered[index]] = [
      reordered[index],
      reordered[index - 1],
    ];

    const imageOrders = reordered.map((img, idx) => ({
      id: img.id,
      position: idx,
    }));

    try {
      const response = await fetch(`/api/cards/${cardId}/images`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageOrders }),
      });

      if (!response.ok) {
        throw new Error("Reorder failed");
      }

      const { images: updatedImages } = await response.json();
      onImagesChange(updatedImages);
      setSelectedIndex(index - 1);
    } catch (error) {
      console.error("Reorder error:", error);
      alert("Failed to reorder images. Please try again.");
    }
  };

  const handleMoveRight = async (index: number) => {
    if (index >= images.length - 1) return;

    const reordered = [...images];
    [reordered[index], reordered[index + 1]] = [
      reordered[index + 1],
      reordered[index],
    ];

    const imageOrders = reordered.map((img, idx) => ({
      id: img.id,
      position: idx,
    }));

    try {
      const response = await fetch(`/api/cards/${cardId}/images`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageOrders }),
      });

      if (!response.ok) {
        throw new Error("Reorder failed");
      }

      const { images: updatedImages } = await response.json();
      onImagesChange(updatedImages);
      setSelectedIndex(index + 1);
    } catch (error) {
      console.error("Reorder error:", error);
      alert("Failed to reorder images. Please try again.");
    }
  };

  return (
    <div className="space-y-4">
      {/* Main image viewer */}
      <div className="relative bg-gray-100 dark:bg-gray-800 rounded-xl overflow-hidden aspect-[3/4]">
        {selectedImage ? (
          <img
            src={selectedImage.url}
            alt={`Card image ${selectedIndex + 1}`}
            className="w-full h-full object-contain"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-400 dark:text-gray-600">
            <div className="text-center">
              <svg
                className="w-16 h-16 mx-auto mb-2"
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
              <p className="text-sm">No images yet</p>
            </div>
          </div>
        )}

        {/* Navigation arrows */}
        {images.length > 1 && (
          <>
            <button
              onClick={() =>
                setSelectedIndex((prev) =>
                  prev > 0 ? prev - 1 : images.length - 1
                )
              }
              className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-2 transition-colors"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </button>
            <button
              onClick={() =>
                setSelectedIndex((prev) =>
                  prev < images.length - 1 ? prev + 1 : 0
                )
              }
              className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-2 transition-colors"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>
          </>
        )}

        {/* Image counter */}
        {images.length > 0 && (
          <div className="absolute bottom-2 right-2 bg-black/50 text-white text-sm px-2 py-1 rounded">
            {selectedIndex + 1} / {images.length}
          </div>
        )}
      </div>

      {/* Thumbnails */}
      {images.length > 0 && (
        <div className="grid grid-cols-4 gap-2">
          {images.map((img, idx) => (
            <div key={img.id} className="relative group">
              <button
                onClick={() => setSelectedIndex(idx)}
                className={`w-full aspect-[3/4] rounded-lg overflow-hidden border-2 transition-all ${
                  idx === selectedIndex
                    ? "border-blue-600 ring-2 ring-blue-600/50"
                    : "border-gray-200 dark:border-gray-700 hover:border-blue-400"
                }`}
              >
                <img
                  src={img.url}
                  alt={`Thumbnail ${idx + 1}`}
                  className="w-full h-full object-cover"
                />
                {img.position === 0 && (
                  <div className="absolute top-1 left-1 bg-blue-600 text-white text-xs px-1.5 py-0.5 rounded">
                    Primary
                  </div>
                )}
              </button>

              {/* Action buttons on hover */}
              {!isLegacyImage(img) ? (
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1 p-1">
                  {img.position !== 0 && (
                    <button
                      onClick={() => handleSetPrimary(img.id)}
                      className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-2 py-1 rounded"
                      title="Set as primary"
                    >
                      Primary
                    </button>
                  )}
                  {idx > 0 && (
                    <button
                      onClick={() => handleMoveLeft(idx)}
                      className="bg-gray-700 hover:bg-gray-600 text-white p-1 rounded"
                      title="Move left"
                    >
                      <svg
                        className="w-3 h-3"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15 19l-7-7 7-7"
                        />
                      </svg>
                    </button>
                  )}
                  {idx < images.length - 1 && (
                    <button
                      onClick={() => handleMoveRight(idx)}
                      className="bg-gray-700 hover:bg-gray-600 text-white p-1 rounded"
                      title="Move right"
                    >
                      <svg
                        className="w-3 h-3"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 5l7 7-7 7"
                        />
                      </svg>
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(img.id)}
                    disabled={deleting === img.id}
                    className="bg-red-600 hover:bg-red-700 text-white p-1 rounded disabled:opacity-50"
                    title="Delete"
                  >
                    <svg
                      className="w-3 h-3"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                  </button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {/* Upload button */}
      <div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => handleUpload(e.target.files)}
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
        >
          {uploading ? (
            <>
              <svg
                className="animate-spin h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              Uploading...
            </>
          ) : (
            <>
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
              Upload Images
            </>
          )}
        </button>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 text-center">
          Upload multiple images (front, back, closeups). Max 10MB per image.
        </p>
      </div>
    </div>
  );
}
