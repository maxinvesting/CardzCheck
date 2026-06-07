"use client";

import { useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { CardIdentificationResult, GradeScanPhotoKind } from "@/types";
import { normalizeIdentificationResult } from "@/lib/card-identity/result";
import { identifyCardFromImages } from "@/lib/identify-card/client";
import { normalizeHttpUrl, uniqueHttpUrls } from "@/lib/collection-images";
import { normalizeGradeScanPhotos } from "@/lib/grading/scanPhotos";

// ── Design tokens (dark — matches grading shell) ──────────────────────────────
const RED        = "#20B26B"; // accent (green) — retained name to limit churn
const RED_DIM    = "rgba(32,178,107,0.08)";
const RED_BORDER = "rgba(32,178,107,0.3)";
const ON_ACCENT  = "#07100B"; // text on accent buttons
const TEXT       = "#E6E8EB";
const MUTED      = "#77808C";
const BORDER     = "#24282D";
const SURFACE    = "#0F1317";
const SURFACE_SOFT = "#13171B";

const MIN_PHOTOS = 2;
const MAX_PHOTOS = 10;

interface DualCardUploaderProps {
  onIdentified: (data: CardIdentificationResult) => void;
  disabled?: boolean;
  onStart?: () => void;
  onReset?: () => void;
}

type ExtraTag = "corner" | "edges" | "surface" | "other";
type PhotoTag = "front" | "back" | ExtraTag | "auto";

interface PhotoDraft {
  id: string;
  file: File;
  preview: string;
  tag: PhotoTag;
}

const EXTRA_TAG_OPTIONS: Array<{ value: ExtraTag; label: string }> = [
  { value: "corner",  label: "Corner" },
  { value: "edges",   label: "Edge" },
  { value: "surface", label: "Surface" },
  { value: "other",   label: "Other" },
];

const MAX_IMAGE_BYTES          = 8 * 1024 * 1024;
const MAX_FALLBACK_DATA_URL_BYTES = 350 * 1024;

function tagToKind(tag: PhotoTag): GradeScanPhotoKind {
  switch (tag) {
    case "front":   return "front";
    case "back":    return "back";
    case "corner":  return "corner_tl";
    case "edges":   return "edges";
    case "surface": return "surface";
    default:        return "other";
  }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function estimateDataUrlByteLength(dataUrl: string): number {
  const idx = dataUrl.indexOf(",");
  if (idx === -1) return 0;
  const b64 = dataUrl.slice(idx + 1);
  const pad = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((b64.length * 3) / 4) - pad);
}

function isDataUrl(value: string): boolean {
  return value.trim().startsWith("data:");
}

async function compressDataUrl(
  dataUrl: string,
  opts: { maxWidth: number; maxHeight: number; quality: number }
): Promise<string | null> {
  if (typeof window === "undefined") return null;
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale  = Math.min(1, opts.maxWidth / img.width, opts.maxHeight / img.height);
      const canvas = document.createElement("canvas");
      canvas.width  = Math.max(1, Math.round(img.width  * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(null); return; }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", opts.quality));
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

/** Assign default tags by index: 1st = front, 2nd = back, rest = auto (then user can retag). */
function defaultTagForIndex(i: number): PhotoTag {
  if (i === 0) return "front";
  if (i === 1) return "back";
  return "auto";
}

// ── Main component ────────────────────────────────────────────────────────────
export default function DualCardUploader({
  onIdentified,
  disabled,
  onStart,
  onReset,
}: DualCardUploaderProps) {
  const [photos,      setPhotos]      = useState<PhotoDraft[]>([]);
  const [dragging,    setDragging]    = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const bulkInputRef  = useRef<HTMLInputElement>(null);
  const addMoreInputRef = useRef<HTMLInputElement>(null);

  const totalPhotos = photos.length;
  const canAnalyze = totalPhotos >= MIN_PHOTOS && totalPhotos <= MAX_PHOTOS;

  const makePhotoId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const validateImageFile = (file: File): string | null => {
    if (!file.type.startsWith("image/")) return "Please upload image files only.";
    if (file.size > MAX_IMAGE_BYTES) return "Each image must be less than 8 MB.";
    return null;
  };

  const replaceWithFiles = useCallback(async (files: File[]) => {
    const imageFiles = files.filter((f) => f.type.startsWith("image/"));
    for (const f of imageFiles) {
      const err = validateImageFile(f);
      if (err) { setError(err); return; }
    }
    if (imageFiles.length < MIN_PHOTOS) {
      setError(`Select at least ${MIN_PHOTOS} images (maximum ${MAX_PHOTOS}).`);
      return;
    }
    if (imageFiles.length > MAX_PHOTOS) {
      setError(`Select at most ${MAX_PHOTOS} images.`);
      return;
    }
    setError(null);
    const previews = await Promise.all(imageFiles.map(readFileAsDataUrl));
    setPhotos(
      imageFiles.map((file, i) => ({
        id: makePhotoId(),
        file,
        preview: previews[i],
        tag: defaultTagForIndex(i),
      }))
    );
  }, []);

  const addMoreFiles = useCallback(async (files: File[]) => {
    const imageFiles = files.filter((f) => f.type.startsWith("image/"));
    for (const f of imageFiles) {
      const err = validateImageFile(f);
      if (err) { setError(err); return; }
    }
    if (imageFiles.length === 0) return;

    const previews = await Promise.all(imageFiles.map(readFileAsDataUrl));

    setPhotos((prev) => {
      const room = MAX_PHOTOS - prev.length;
      if (room <= 0) {
        setError(`Maximum ${MAX_PHOTOS} images.`);
        return prev;
      }
      const n = Math.min(room, imageFiles.length);
      const toAdd = imageFiles.slice(0, n);
      const prevSlice = previews.slice(0, n);
      if (n < imageFiles.length) {
        setError(`Only ${n} more image${n === 1 ? "" : "s"} fit (max ${MAX_PHOTOS}).`);
      } else {
        setError(null);
      }
      const startIdx = prev.length;
      return [
        ...prev,
        ...toAdd.map((file, j) => ({
          id: makePhotoId(),
          file,
          preview: prevSlice[j],
          tag: defaultTagForIndex(startIdx + j),
        })),
      ];
    });
  }, []);

  const uploadFile = useCallback(async (file: File, fallbackDataUrl: string): Promise<string> => {
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Authentication required");
      const fileName = `${user.id}/${Date.now()}-${file.name}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("card-images")
        .upload(fileName, file);
      if (uploadError) throw new Error(uploadError.message);
      const { data: { publicUrl } } = supabase.storage.from("card-images").getPublicUrl(uploadData.path);
      return publicUrl;
    } catch {
      const bytes = estimateDataUrlByteLength(fallbackDataUrl);
      if (bytes <= MAX_FALLBACK_DATA_URL_BYTES) return fallbackDataUrl;
      const compressed = await compressDataUrl(fallbackDataUrl, { maxWidth: 1200, maxHeight: 1200, quality: 0.72 });
      return compressed || fallbackDataUrl;
    }
  }, []);

  const handleAnalyze = useCallback(async () => {
    if (photos.length < MIN_PHOTOS || photos.length > MAX_PHOTOS) return;
    const frontPhoto = photos[0];
    const backPhoto = photos[1];
    if (!frontPhoto || !backPhoto) return;

    setError(null);
    onStart?.();
    setLoading(true);

    try {
      const allDrafts = photos;
      const uploadedUrls = await Promise.all(allDrafts.map((p) => uploadFile(p.file, p.preview)));

      const scanPhotos = normalizeGradeScanPhotos(
        allDrafts.map((p, i) => ({
          url: uploadedUrls[i],
          kind: i === 0 ? "front" : i === 1 ? "back" : tagToKind(p.tag),
          sort_order: i,
        }))
      );

      const frontUrl = uploadedUrls[0];
      const backUrl  = uploadedUrls[1];

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
        .map((p) => p.url)
        .filter((u) => typeof u === "string" && u.trim().length > 0);
      const sanitizedUrls  = uniqueHttpUrls(allImageUrls);
      const userImageUrl   = normalizeHttpUrl(frontUrl) || normalizeHttpUrl(sanitizedUrls[0] || null);
      const displayImageUrl = userImageUrl || allImageUrls[0] || "";

      if (result.card_identity?.warnings?.includes("parse_error")) {
        setError("Couldn't read card details clearly. Please confirm the year and set.");
      } else if (result.confidence === "low") {
        setError(`Identified with low confidence — player: ${result.player_name || "Unknown"}. Please verify.`);
      }

      onIdentified(
        normalizeIdentificationResult({
          player_name:  result.player_name,
          players:      result.players || [result.player_name],
          year:         result.year     || undefined,
          set_name:     result.set_name || undefined,
          insert:       result.insert   || undefined,
          grade:        result.grade    || undefined,
          parallel_type: (result.card_identity?.parallel ?? result.variant) || undefined,
          imageUrl:     displayImageUrl,
          imageUrls:    allImageUrls,
          scanPhotos,
          userImageUrl: userImageUrl || undefined,
          confidence:   result.confidence,
          cardIdentity: result.card_identity,
        })
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to process images.");
      onReset?.();
    } finally {
      setLoading(false);
    }
  }, [photos, onStart, uploadFile, onIdentified, onReset]);

  const removePhoto = useCallback((id: string) => {
    setPhotos((prev) => {
      const next = prev.filter((p) => p.id !== id);
      return next.map((p, i) => {
        let tag: PhotoTag = p.tag;
        if (i === 0) tag = "front";
        else if (i === 1) tag = "back";
        else if (tag === "front" || tag === "back") tag = "auto";
        return { ...p, tag };
      });
    });
    setError(null);
  }, []);

  const updateTag = useCallback((id: string, tag: PhotoTag) => {
    setPhotos((prev) => prev.map((p) => (p.id === id ? { ...p, tag } : p)));
  }, []);

  const clearAll = useCallback(() => {
    setPhotos([]);
    setError(null);
  }, []);

  // ── Loading state ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{
        minHeight: 200, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: 12,
        border: `1px solid ${BORDER}`, borderRadius: 2, background: SURFACE_SOFT,
      }}>
        <div style={{
          width: 24, height: 24, borderRadius: "50%",
          border: `2px solid ${RED}`, borderTopColor: "transparent",
          animation: "spin 0.8s linear infinite",
        }} />
        <p style={{ fontSize: 12, color: MUTED }}>
          Processing {totalPhotos} photo{totalPhotos === 1 ? "" : "s"}…
        </p>
        <style jsx global>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const onBulkChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = Array.from(e.target.files ?? []);
    e.currentTarget.value = "";
    void replaceWithFiles(list);
  };

  const onAddMoreChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = Array.from(e.target.files ?? []);
    e.currentTarget.value = "";
    void addMoreFiles(list);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const list = Array.from(e.dataTransfer.files ?? []);
    if (photos.length === 0) void replaceWithFiles(list);
    else void addMoreFiles(list);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      <div>
        <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: "1.5px", color: RED, textTransform: "uppercase", marginBottom: 10 }}>
          Card Upload
        </p>

        <div
          onDrop={onDrop}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={(e) => { e.preventDefault(); setDragging(false); }}
          onClick={() => {
            if (disabled || photos.length > 0) return;
            bulkInputRef.current?.click();
          }}
          style={{
            border: `1px dashed ${dragging ? RED : BORDER}`,
            borderRadius: 2,
            padding: "20px 16px",
            textAlign: "center",
            background: dragging ? RED_DIM : SURFACE_SOFT,
            cursor: disabled ? "not-allowed" : photos.length === 0 ? "pointer" : "default",
            transition: "all 0.1s",
          }}
        >
          <input
            ref={bulkInputRef}
            type="file"
            accept="image/*"
            multiple
            disabled={disabled}
            style={{ display: "none" }}
            onChange={onBulkChange}
          />
          <input
            ref={addMoreInputRef}
            type="file"
            accept="image/*"
            multiple
            disabled={disabled}
            style={{ display: "none" }}
            onChange={onAddMoreChange}
          />

          <p style={{ fontSize: 11, color: MUTED, marginBottom: 12, lineHeight: 1.5 }}>
            Add <strong style={{ color: TEXT }}>{MIN_PHOTOS}–{MAX_PHOTOS} images</strong> in one selection (or drop them here).
            Order matters: <strong style={{ color: TEXT }}>1st = front</strong>, <strong style={{ color: TEXT }}>2nd = back</strong>, then corners, edges, or surface.
          </p>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (!disabled) bulkInputRef.current?.click();
            }}
            disabled={disabled}
            style={{
              padding: "12px 20px",
              fontSize: 11, fontWeight: 700, letterSpacing: "0.9px", textTransform: "uppercase",
              color: ON_ACCENT, background: RED,
              border: "none", borderRadius: 2,
              cursor: disabled ? "not-allowed" : "pointer",
              width: "100%",
              maxWidth: 320,
              margin: "0 auto",
              display: "block",
            }}
          >
            Upload front + back
          </button>

          <p style={{ fontSize: 9, color: MUTED, marginTop: 10 }}>
            JPG · PNG · WebP · up to 8 MB each
          </p>
        </div>

        {photos.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <p style={{ fontSize: 10, color: MUTED }}>
                {photos.length} / {MAX_PHOTOS} images
              </p>
              <div style={{ display: "flex", gap: 10 }}>
                {photos.length < MAX_PHOTOS && (
                  <button
                    type="button"
                    onClick={() => !disabled && addMoreInputRef.current?.click()}
                    disabled={disabled}
                    style={{ fontSize: 10, color: RED, background: "none", border: "none", cursor: disabled ? "not-allowed" : "pointer", fontWeight: 600 }}
                  >
                    Add more
                  </button>
                )}
                <button
                  type="button"
                  onClick={clearAll}
                  disabled={disabled}
                  style={{ fontSize: 10, color: MUTED, background: "none", border: "none", cursor: "pointer" }}
                >
                  Clear all
                </button>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(88px, 1fr))", gap: 8 }}>
              {photos.map((photo, index) => (
                <div key={photo.id} style={{ position: "relative" }}>
                  <img
                    src={photo.preview}
                    alt={`Card ${index + 1}`}
                    style={{
                      width: "100%",
                      aspectRatio: "3/4",
                      objectFit: "cover",
                      borderRadius: 2,
                      border: `1px solid ${BORDER}`,
                      display: "block",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => removePhoto(photo.id)}
                    disabled={disabled}
                    style={{
                      position: "absolute", top: 4, right: 4,
                      width: 20, height: 20, borderRadius: 2,
                      background: "rgba(0,0,0,0.65)",
                      border: `1px solid ${BORDER}`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      cursor: "pointer", color: "#E6E8EB", padding: 0,
                    }}
                    aria-label="Remove image"
                  >
                    <svg width="8" height="8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                  <div style={{ marginTop: 4 }}>
                    {index === 0 && (
                      <p style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.5px", color: RED, textTransform: "uppercase", margin: 0 }}>Front</p>
                    )}
                    {index === 1 && (
                      <p style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.5px", color: RED, textTransform: "uppercase", margin: 0 }}>Back</p>
                    )}
                    {index >= 2 && (
                      <select
                        value={photo.tag === "front" || photo.tag === "back" ? "auto" : photo.tag}
                        onChange={(e) => {
                          const v = e.target.value as PhotoTag;
                          updateTag(photo.id, v);
                        }}
                        style={{
                          width: "100%",
                          fontSize: 9, padding: "2px 0",
                          background: SURFACE, border: `1px solid ${BORDER}`,
                          borderRadius: 2, color: TEXT, outline: "none",
                        }}
                      >
                        <option value="auto">Auto</option>
                        {EXTRA_TAG_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {photos.length > 0 && photos.length < MIN_PHOTOS && (
          <p style={{ fontSize: 10, color: MUTED, marginTop: 8 }}>
            Add at least {MIN_PHOTOS} images to continue.
          </p>
        )}
      </div>

      {error && (
        <div style={{
          padding: "10px 14px",
          background: "rgba(185,28,28,0.06)",
          border: `1px solid ${RED_BORDER}`,
          borderRadius: 2,
        }}>
          <p style={{ fontSize: 11, color: RED }}>{error}</p>
        </div>
      )}

      <button
        type="button"
        onClick={() => { void handleAnalyze(); }}
        disabled={!canAnalyze || Boolean(disabled)}
        style={{
          padding: "13px",
          fontSize: 11, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase",
          color: canAnalyze && !disabled ? ON_ACCENT : MUTED,
          background: canAnalyze && !disabled ? RED : SURFACE_SOFT,
          border: `1px solid ${canAnalyze && !disabled ? RED : BORDER}`,
          borderRadius: 2,
          cursor: !canAnalyze || disabled ? "not-allowed" : "pointer",
          width: "100%",
        }}
      >
        {canAnalyze
          ? `Analyze ${totalPhotos} photo${totalPhotos === 1 ? "" : "s"} →`
          : `Upload front and back to start`}
      </button>

    </div>
  );
}
