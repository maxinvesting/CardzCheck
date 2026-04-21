import type { CollectionItem } from "@/types";
import { isCertImageSource } from "@/lib/images/cert-image";
import {
  buildClientImageUrl,
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
  if (trusted) return buildClientImageUrl(trusted) ?? trusted;

  const primary = normalizeTrustedImageUrl(item.primary_image?.url ?? null);
  if (primary) return buildClientImageUrl(primary) ?? primary;

  const userImage = normalizeTrustedImageUrl(item.user_image_url ?? null);
  if (userImage) return buildClientImageUrl(userImage) ?? userImage;

  if (isCertImageSource(item.image_source ?? null) || item.image_source === "user") {
    const imageUrl = normalizeTrustedImageUrl(item.image_url ?? null);
    return buildClientImageUrl(imageUrl) ?? imageUrl;
  }

  return null;
}
