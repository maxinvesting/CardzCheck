import "server-only";

import { buildImageStats, type ImageStats } from "@/lib/grading/fallbackEstimate";
import {
  GRADE_SCAN_MAX_CLOSEUPS,
  GRADE_SCAN_MAX_TOTAL_PHOTOS,
  GRADE_SCAN_REQUIRED_KINDS,
  buildGradeScanPhotosFromUrls,
  isCloseupKind,
  isGradeScanPhotoKind,
  normalizeGradeScanPhotos,
} from "@/lib/grading/scanPhotos";
import type { GradeScanPhoto, GradeScanPhotoKind } from "@/types";

export const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
export const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export type ResolvedGradeEstimateImage = {
  base64Image: string;
  mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
  bytes: number;
  source: "url" | "base64";
  kind: GradeScanPhotoKind;
  originalUrl: string;
};

function validateBase64Image(dataUrl: string): {
  valid: boolean;
  size?: number;
  mimeType?: string;
  base64Data?: string;
  error?: string;
} {
  const matches = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
  if (!matches) {
    return { valid: false, error: "Invalid base64 data URL format" };
  }

  const [, mimeType, base64Data] = matches;

  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    return {
      valid: false,
      error: `Invalid image type: ${mimeType}. Allowed: ${ALLOWED_MIME_TYPES.join(", ")}`,
    };
  }

  const decodedSize = Math.ceil((base64Data.length * 3) / 4);
  if (decodedSize > MAX_IMAGE_SIZE_BYTES) {
    return {
      valid: false,
      error: `Image too large: ${(decodedSize / 1024 / 1024).toFixed(1)}MB. Maximum: 10MB`,
    };
  }

  return { valid: true, size: decodedSize, mimeType, base64Data };
}

function validateImageUrl(url: string): { valid: boolean; error?: string } {
  if (!url.startsWith("https://")) {
    return { valid: false, error: "Image URL must use HTTPS" };
  }
  try {
    new URL(url);
    return { valid: true };
  } catch {
    return { valid: false, error: "Invalid URL format" };
  }
}

function validateFetchedImage(
  contentType: string | null,
  contentLength: string | null
): { valid: boolean; error?: string } {
  const mimeType = contentType?.split(";")[0]?.trim();
  if (!mimeType || !ALLOWED_MIME_TYPES.includes(mimeType)) {
    return {
      valid: false,
      error: `Invalid image type: ${mimeType || "unknown"}. Allowed: ${ALLOWED_MIME_TYPES.join(", ")}`,
    };
  }

  if (contentLength) {
    const size = parseInt(contentLength, 10);
    if (!isNaN(size) && size > MAX_IMAGE_SIZE_BYTES) {
      return {
        valid: false,
        error: `Image too large: ${(size / 1024 / 1024).toFixed(1)}MB. Maximum: 10MB`,
      };
    }
  }

  return { valid: true };
}

export function extractImageUrls(body: unknown): string[] {
  return extractScanPhotos(body).map((photo) => photo.url);
}

function extractLegacyImageUrls(body: unknown): string[] {
  const imageUrls = Array.isArray((body as { imageUrls?: unknown })?.imageUrls)
    ? ((body as { imageUrls?: unknown[] }).imageUrls ?? []).filter(
        (value): value is string => typeof value === "string"
      )
    : [];
  const imageUrl =
    typeof (body as { imageUrl?: unknown })?.imageUrl === "string"
      ? (body as { imageUrl?: string }).imageUrl
      : undefined;

  if (imageUrls.length > 0) return imageUrls;
  return imageUrl ? [imageUrl] : [];
}

export function extractScanPhotos(body: unknown): GradeScanPhoto[] {
  const scanPhotos = normalizeGradeScanPhotos(
    (body as { scanPhotos?: unknown })?.scanPhotos
  );
  if (scanPhotos.length > 0) {
    return scanPhotos;
  }

  const frontUrl =
    typeof (body as { front_url?: unknown })?.front_url === "string"
      ? (body as { front_url: string }).front_url.trim()
      : "";
  const backUrl =
    typeof (body as { back_url?: unknown })?.back_url === "string"
      ? (body as { back_url: string }).back_url.trim()
      : "";
  const closeupsRaw = Array.isArray((body as { closeups?: unknown })?.closeups)
    ? ((body as { closeups?: unknown[] }).closeups ?? [])
    : [];

  if (frontUrl && backUrl) {
    const closeups = closeupsRaw
      .map((entry, index): GradeScanPhoto | null => {
        if (!entry || typeof entry !== "object") return null;
        const row = entry as Record<string, unknown>;
        const url = typeof row.url === "string" ? row.url.trim() : "";
        if (!url) return null;
        const kind =
          isGradeScanPhotoKind(row.kind) && row.kind !== "front" && row.kind !== "back"
            ? row.kind
            : "other";
        const sortOrderRaw =
          typeof row.sort_order === "number" && Number.isFinite(row.sort_order)
            ? Math.round(row.sort_order)
            : index;
        return { url, kind, sort_order: Math.max(0, sortOrderRaw) };
      })
      .filter((photo): photo is GradeScanPhoto => photo !== null)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .slice(0, GRADE_SCAN_MAX_CLOSEUPS);

    return [
      { url: frontUrl, kind: "front", sort_order: 0 },
      { url: backUrl, kind: "back", sort_order: 1 },
      ...closeups.map((photo, index) => ({
        ...photo,
        sort_order: index + 2,
      })),
    ];
  }

  return buildGradeScanPhotosFromUrls(extractLegacyImageUrls(body));
}

function validateScanPhotos(scanPhotos: GradeScanPhoto[]) {
  if (scanPhotos.length === 0) {
    throw new Error("Missing image URL");
  }
  if (scanPhotos.length > GRADE_SCAN_MAX_TOTAL_PHOTOS) {
    throw new Error(`Too many images. Maximum ${GRADE_SCAN_MAX_TOTAL_PHOTOS} allowed.`);
  }

  for (const requiredKind of GRADE_SCAN_REQUIRED_KINDS) {
    if (!scanPhotos.some((photo) => photo.kind === requiredKind)) {
      throw new Error("Front and back images are required.");
    }
  }

  const closeupCount = scanPhotos.filter((photo) => isCloseupKind(photo.kind)).length;
  if (closeupCount > GRADE_SCAN_MAX_CLOSEUPS) {
    throw new Error(`Too many close-up images. Maximum ${GRADE_SCAN_MAX_CLOSEUPS} allowed.`);
  }
}

export async function resolveGradeEstimateImages(
  scanPhotos: GradeScanPhoto[]
): Promise<{ resolvedImages: ResolvedGradeEstimateImage[]; imageStats: ImageStats }> {
  validateScanPhotos(scanPhotos);

  const resolvedImages: ResolvedGradeEstimateImage[] = [];
  const imageSizes: number[] = [];

  for (let i = 0; i < scanPhotos.length; i += 1) {
    const photo = scanPhotos[i];
    const imageUrl = photo.url;
    try {
      let base64Image: string;
      let mediaType: ResolvedGradeEstimateImage["mediaType"];
      let bytes: number;

      if (imageUrl.startsWith("data:image/")) {
        const validation = validateBase64Image(imageUrl);
        if (!validation.valid) {
          throw new Error(validation.error || "Invalid base64 image");
        }

        base64Image = validation.base64Data!;
        mediaType = validation.mimeType as ResolvedGradeEstimateImage["mediaType"];
        bytes = validation.size ?? Math.ceil((base64Image.length * 3) / 4);
        resolvedImages.push({
          base64Image,
          mediaType,
          bytes,
          source: "base64",
          kind: photo.kind,
          originalUrl: imageUrl,
        });
      } else {
        const urlValidation = validateImageUrl(imageUrl);
        if (!urlValidation.valid) {
          throw new Error(urlValidation.error || "Invalid image URL");
        }

        const imageResponse = await fetch(imageUrl);
        if (!imageResponse.ok) {
          throw new Error("Image URL is not accessible");
        }

        const contentType = imageResponse.headers.get("content-type");
        const contentLength = imageResponse.headers.get("content-length");
        const fetchValidation = validateFetchedImage(contentType, contentLength);
        if (!fetchValidation.valid) {
          throw new Error(fetchValidation.error || "Invalid image");
        }

        const imageBuffer = await imageResponse.arrayBuffer();
        if (imageBuffer.byteLength > MAX_IMAGE_SIZE_BYTES) {
          throw new Error(
            `Image is ${(imageBuffer.byteLength / 1024 / 1024).toFixed(1)}MB. Maximum: 10MB`
          );
        }

        base64Image = Buffer.from(imageBuffer).toString("base64");
        mediaType = (contentType?.split(";")[0] || "image/jpeg") as ResolvedGradeEstimateImage["mediaType"];
        bytes = imageBuffer.byteLength;
        resolvedImages.push({
          base64Image,
          mediaType,
          bytes,
          source: "url",
          kind: photo.kind,
          originalUrl: imageUrl,
        });
      }

      imageSizes.push(bytes);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid image";
      throw new Error(`Image ${i + 1}: ${message}`);
    }
  }

  return { resolvedImages, imageStats: buildImageStats(imageSizes) };
}
