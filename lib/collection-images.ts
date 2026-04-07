import type { CollectionItem } from "@/types";
import {
  getTrustedFrontImageUrl,
  normalizeHttpUrl,
  normalizeTrustedImageUrl,
  resolveStoredImagePath,
  uniqueTrustedImageUrls,
} from "@/lib/images/shared";

export { normalizeHttpUrl, resolveStoredImagePath } from "@/lib/images/shared";

export function uniqueHttpUrls(values: Array<unknown>): string[] {
  return uniqueTrustedImageUrls(values);
}

export type CollectionImageLike = Pick<
  CollectionItem,
  "image_url" | "image_source" | "user_image_url" | "primary_image" | "trusted_image"
>;

export function pickCollectionImageUrl(item: CollectionImageLike): string | null {
  const trusted = getTrustedFrontImageUrl(item.trusted_image ?? null);
  if (trusted) return trusted;

  const primary = normalizeTrustedImageUrl(item.primary_image?.url ?? null);
  if (primary) return primary;

  const userImage = normalizeTrustedImageUrl(item.user_image_url ?? null);
  if (userImage) return userImage;

  if (item.image_source === "psa" || item.image_source === "user") {
    return normalizeTrustedImageUrl(item.image_url ?? null);
  }

  return null;
}
