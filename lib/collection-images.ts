import type { CollectionItem } from "@/types";

export function normalizeHttpUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return /^https?:\/\//i.test(trimmed) ? trimmed : null;
}

export function uniqueHttpUrls(values: Array<unknown>): string[] {
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const value of values) {
    const normalized = normalizeHttpUrl(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    urls.push(normalized);
  }
  return urls;
}

export type CollectionImageLike = Pick<
  CollectionItem,
  "image_url" | "user_image_url" | "stock_image_url" | "ebay_image_url" | "primary_image"
>;

export function pickCollectionImageUrl(item: CollectionImageLike): string | null {
  const primary = normalizeHttpUrl(item.primary_image?.url ?? null);
  if (primary) return primary;

  return (
    normalizeHttpUrl(item.user_image_url) ||
    normalizeHttpUrl(item.stock_image_url) ||
    normalizeHttpUrl(item.ebay_image_url) ||
    normalizeHttpUrl(item.image_url)
  );
}

export function resolveStoredImagePath(
  storagePath: string | null | undefined,
  getPublicUrl: (path: string) => string
): string | null {
  const httpUrl = normalizeHttpUrl(storagePath ?? null);
  if (httpUrl) return httpUrl;

  if (!storagePath || !storagePath.trim()) {
    return null;
  }

  return getPublicUrl(storagePath);
}
