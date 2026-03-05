import type { GradeScanPhoto, GradeScanPhotoKind } from "@/types";

export const GRADE_SCAN_MAX_TOTAL_PHOTOS = 10;
export const GRADE_SCAN_MAX_CLOSEUPS = 8;

export const GRADE_SCAN_REQUIRED_KINDS: GradeScanPhotoKind[] = ["front", "back"];

export const GRADE_SCAN_CLOSEUP_KINDS: GradeScanPhotoKind[] = [
  "corner_tl",
  "corner_tr",
  "corner_bl",
  "corner_br",
  "edges",
  "surface",
  "other",
];

export const GRADE_SCAN_KIND_LABELS: Record<GradeScanPhotoKind, string> = {
  front: "Front",
  back: "Back",
  corner_tl: "Top Left Corner",
  corner_tr: "Top Right Corner",
  corner_bl: "Bottom Left Corner",
  corner_br: "Bottom Right Corner",
  edges: "Edges",
  surface: "Surface",
  other: "Other",
};

const KIND_SET = new Set<GradeScanPhotoKind>([
  ...GRADE_SCAN_REQUIRED_KINDS,
  ...GRADE_SCAN_CLOSEUP_KINDS,
]);

export function isGradeScanPhotoKind(value: unknown): value is GradeScanPhotoKind {
  return typeof value === "string" && KIND_SET.has(value as GradeScanPhotoKind);
}

export function isCloseupKind(kind: GradeScanPhotoKind): boolean {
  return kind !== "front" && kind !== "back";
}

export function buildGradeScanPhotosFromUrls(urls: string[]): GradeScanPhoto[] {
  return urls
    .map((url, index): GradeScanPhoto | null => {
      if (typeof url !== "string") return null;
      const trimmed = url.trim();
      if (!trimmed) return null;
      const kind: GradeScanPhotoKind =
        index === 0 ? "front" : index === 1 ? "back" : "other";
      return { url: trimmed, kind, sort_order: index };
    })
    .filter((photo): photo is GradeScanPhoto => photo !== null)
    .slice(0, GRADE_SCAN_MAX_TOTAL_PHOTOS);
}

export function normalizeGradeScanPhotos(value: unknown): GradeScanPhoto[] {
  if (!Array.isArray(value)) return [];
  const rows = value
    .map((entry, index): GradeScanPhoto | null => {
      if (!entry || typeof entry !== "object") return null;
      const row = entry as Record<string, unknown>;
      const rawUrl = typeof row.url === "string" ? row.url.trim() : "";
      if (!rawUrl) return null;
      const rawKind = isGradeScanPhotoKind(row.kind) ? row.kind : "other";
      const sortOrderRaw =
        typeof row.sort_order === "number" && Number.isFinite(row.sort_order)
          ? Math.round(row.sort_order)
          : index;

      return {
        url: rawUrl,
        kind: rawKind,
        sort_order: Math.max(0, sortOrderRaw),
      };
    })
    .filter((photo): photo is GradeScanPhoto => photo !== null)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  return rows.slice(0, GRADE_SCAN_MAX_TOTAL_PHOTOS).map((photo, index) => ({
    ...photo,
    sort_order: index,
  }));
}

export function getCloseupPhotos(photos: GradeScanPhoto[]): GradeScanPhoto[] {
  return photos.filter((photo) => isCloseupKind(photo.kind));
}

export function getFrontBackPhotos(photos: GradeScanPhoto[]): {
  front: GradeScanPhoto | null;
  back: GradeScanPhoto | null;
} {
  const front = photos.find((photo) => photo.kind === "front") ?? null;
  const back = photos.find((photo) => photo.kind === "back") ?? null;
  return { front, back };
}

export function uniquePhotoUrls(photos: GradeScanPhoto[]): GradeScanPhoto[] {
  const seen = new Set<string>();
  return photos.filter((photo) => {
    const key = photo.url.trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
