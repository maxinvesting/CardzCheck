import type {
  CardIdentificationResult,
  GradeEstimatorHistoryCardSnapshot,
} from "@/types";
import { normalizeGradeScanPhotos } from "@/lib/grading/scanPhotos";

function isDataUrl(value?: string | null): boolean {
  if (!value) return false;
  return value.trim().startsWith("data:");
}

function sanitizeScanPhotosForHistory(
  photos?: GradeEstimatorHistoryCardSnapshot["scanPhotos"],
  options?: { allowDataUrls?: boolean }
) {
  const allowDataUrls = options?.allowDataUrls ?? false;
  const sanitized = normalizeGradeScanPhotos(photos)
    .filter((photo) => {
      if (!photo.url?.trim()) return false;
      if (allowDataUrls) return true;
      return !isDataUrl(photo.url);
    })
    .map((photo, index) => ({
      url: photo.url.trim(),
      kind: photo.kind,
      sort_order: index,
    }));

  return sanitized.length > 0 ? sanitized : undefined;
}

async function downscaleDataUrl(
  dataUrl: string,
  options: { maxWidth: number; maxHeight: number; quality?: number }
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
      resolve(canvas.toDataURL("image/jpeg", options.quality ?? 0.7));
    };
    image.onerror = () => resolve(null);
    image.src = dataUrl;
  });
}

export function buildHistoryCardSnapshot(
  card: CardIdentificationResult
): GradeEstimatorHistoryCardSnapshot {
  return {
    player_name: card.player_name,
    year: card.year,
    set_name: card.set_name,
    card_number: card.card_number,
    parallel_type: card.parallel_type,
    variation: card.variation,
    insert: card.insert,
    grade: card.grade,
    imageUrl: card.imageUrl,
    imageUrls: card.imageUrls,
    scanPhotos: card.scanPhotos,
    confidence: card.confidence,
  };
}

export async function buildHistoryCacheCardSnapshot(
  card: GradeEstimatorHistoryCardSnapshot
): Promise<GradeEstimatorHistoryCardSnapshot> {
  const direct = card.imageUrl?.trim() ?? "";
  const fallback = card.imageUrls?.find((url) => url && url.trim())?.trim();
  const source = direct || fallback;

  if (!source) {
    const sanitized = { ...card };
    delete sanitized.imageUrl;
    delete sanitized.imageUrls;
    sanitized.scanPhotos = sanitizeScanPhotosForHistory(card.scanPhotos, {
      allowDataUrls: false,
    });
    return sanitized;
  }

  if (!isDataUrl(source)) {
    return {
      ...card,
      imageUrl: source,
      imageUrls: undefined,
      scanPhotos: sanitizeScanPhotosForHistory(card.scanPhotos, {
        allowDataUrls: false,
      }),
    };
  }

  const thumbnail = await downscaleDataUrl(source, {
    maxWidth: 120,
    maxHeight: 168,
    quality: 0.7,
  });

  if (!thumbnail) {
    const sanitized = { ...card };
    delete sanitized.imageUrl;
    delete sanitized.imageUrls;
    sanitized.scanPhotos = sanitizeScanPhotosForHistory(card.scanPhotos, {
      allowDataUrls: false,
    });
    return sanitized;
  }

  return {
    ...card,
    imageUrl: thumbnail,
    imageUrls: undefined,
    scanPhotos: sanitizeScanPhotosForHistory(card.scanPhotos, {
      allowDataUrls: false,
    }),
  };
}

export function sanitizeHistoryCardSnapshot(
  card: GradeEstimatorHistoryCardSnapshot
): GradeEstimatorHistoryCardSnapshot {
  const direct = card.imageUrl && !isDataUrl(card.imageUrl) ? card.imageUrl.trim() : "";
  const fallback = !direct
    ? card.imageUrls?.find((url) => url && !isDataUrl(url))?.trim()
    : undefined;
  const sanitized: GradeEstimatorHistoryCardSnapshot = { ...card };

  if (direct || fallback) {
    sanitized.imageUrl = direct || fallback;
  } else {
    delete sanitized.imageUrl;
  }

  sanitized.scanPhotos = sanitizeScanPhotosForHistory(card.scanPhotos, {
    allowDataUrls: false,
  });
  delete sanitized.imageUrls;
  return sanitized;
}
