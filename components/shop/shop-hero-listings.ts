import type { ShopListing } from "@/types/shop";

export type HeroListingCandidate = Pick<
  ShopListing,
  "id" | "created_at" | "featured" | "quantity" | "quantity_sold"
>;

export function isListingAvailable(listing: HeroListingCandidate): boolean {
  return Math.max(0, listing.quantity - listing.quantity_sold) > 0;
}

function compareCreatedAtDesc(
  a: Pick<HeroListingCandidate, "created_at">,
  b: Pick<HeroListingCandidate, "created_at">
): number {
  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
}

export function selectHeroListings<T extends HeroListingCandidate>(
  listings: T[],
  limit = 3
): T[] {
  if (!Array.isArray(listings) || listings.length === 0 || limit <= 0) {
    return [];
  }

  const source = listings.some(isListingAvailable)
    ? listings.filter(isListingAvailable)
    : [...listings];

  const featured = source
    .filter((listing) => listing.featured)
    .sort(compareCreatedAtDesc);
  const standard = source
    .filter((listing) => !listing.featured)
    .sort(compareCreatedAtDesc);

  return [...featured, ...standard].slice(0, limit);
}
