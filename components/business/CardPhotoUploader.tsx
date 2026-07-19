"use client";

import { useCallback, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface Props {
  images: string[];
  onChange: (next: string[]) => void;
  /** Max photos allowed (e.g. 3 for graded, 10 for raw). */
  max: number;
  /** Notifies the parent while an upload is in flight, to gate Save buttons. */
  onUploadingChange?: (uploading: boolean) => void;
  /** Surfaces upload errors to the parent's error area. */
  onError?: (message: string | null) => void;
  /** Thumbnail size — "sm" inside the edit drawer, "md" in the add modal. */
  size?: "sm" | "md";
}

export default function CardPhotoUploader({
  images,
  onChange,
  max,
  onUploadingChange,
  onError,
  size = "sm",
}: Props) {
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const remaining = Math.max(0, max - images.length);
  const thumb = size === "md" ? "h-28 w-20" : "h-20 w-16";

  const setBusy = useCallback(
    (next: boolean) => {
      setUploading(next);
      onUploadingChange?.(next);
    },
    [onUploadingChange]
  );

  const handleFiles = useCallback(
    async (fileList: FileList | null) => {
      // Capture File objects synchronously — the FileList reference is cleared
      // as soon as the input value is reset, so it must be read before any await.
      const files = fileList ? Array.from(fileList) : [];
      if (files.length === 0) return;
      onError?.(null);

      if (remaining <= 0) {
        onError?.(`You can add up to ${max} photo${max === 1 ? "" : "s"} for this card.`);
        return;
      }
      const toUpload = files.slice(0, remaining);
      if (files.length > toUpload.length) {
        onError?.(`Only ${max} photo${max === 1 ? "" : "s"} allowed — extra files were skipped.`);
      }

      setBusy(true);
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) throw new Error("You must be signed in to upload photos.");

        const urls: string[] = [];
        for (const file of toUpload) {
          if (!file.type.startsWith("image/")) {
            throw new Error(`"${file.name}" is not an image.`);
          }
          const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
          const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`;
          const { data, error: upErr } = await supabase.storage
            .from("card-images")
            .upload(path, file, { contentType: file.type, upsert: false });
          if (upErr) throw new Error(upErr.message);
          urls.push(supabase.storage.from("card-images").getPublicUrl(data.path).data.publicUrl);
        }
        onChange(Array.from(new Set([...images, ...urls])).slice(0, max));
      } catch (err) {
        onError?.(err instanceof Error ? err.message : "Failed to upload photo");
      } finally {
        setBusy(false);
      }
    },
    [images, max, onChange, onError, remaining, setBusy]
  );

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-[#77808C]">
          Photos
        </span>
        <span className="text-[10px] text-[#5A626E]">
          {images.length}/{max}
        </span>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!dragging) setDragging(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void handleFiles(e.dataTransfer.files);
        }}
        className={`flex flex-wrap items-center gap-2 border border-dashed p-2 transition-colors ${
          dragging ? "border-[#20B26B] bg-[#0E251B]" : "border-[#343941] bg-[#0F1317]"
        }`}
      >
        {images.map((url) => (
          <div key={url} className={`group relative ${thumb}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="Card" className="h-full w-full border border-[#24282D] object-cover" />
            <button
              type="button"
              onClick={() => onChange(images.filter((u) => u !== url))}
              className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center bg-black/70 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100"
              aria-label="Remove photo"
            >
              ✕
            </button>
          </div>
        ))}

        {remaining > 0 ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className={`flex ${thumb} cursor-pointer flex-col items-center justify-center border border-dashed border-[#343941] bg-[#0B0D0F] px-1 text-center text-[9px] leading-tight text-[#77808C] transition-colors hover:border-[#20B26B] hover:text-[#E6E8EB] disabled:opacity-50`}
          >
            {uploading ? "Uploading…" : "Drag & drop or click"}
          </button>
        ) : null}

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            const fl = e.target.files;
            void handleFiles(fl);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}
