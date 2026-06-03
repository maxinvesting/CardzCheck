export const DAY30_REDUCTION_RATE = 0.075;
export const DAY30_DAYS = 30;
export const DAY60_DAYS = 60;

/**
 * Markup applied to the eBay co-list price relative to the CardzCheck
 * marketplace price. Set so that, after eBay/marketplace fee differences, the
 * seller's take-home is the same whichever surface the card sells on.
 */
export const EBAY_COLIST_MARKUP_RATE = 0.135;

/**
 * Compute the eBay co-list price for a given CardzCheck marketplace price.
 */
export function ebayColistPriceCents(marketplacePriceCents: number): number {
  if (!Number.isFinite(marketplacePriceCents) || marketplacePriceCents <= 0) {
    throw new Error("invalid price");
  }
  return Math.max(1, Math.round(marketplacePriceCents * (1 + EBAY_COLIST_MARKUP_RATE)));
}

/**
 * Apply the day-30 markdown. Pure math; rounded to whole cents.
 */
export function applyDay30Markdown(currentPriceCents: number): number {
  if (!Number.isFinite(currentPriceCents) || currentPriceCents <= 0) {
    throw new Error("invalid price");
  }
  const reduced = currentPriceCents * (1 - DAY30_REDUCTION_RATE);
  return Math.max(1, Math.round(reduced));
}

/**
 * Apply a seller-configured auto-markdown, clamped to a floor.
 * Returns the same price (no-op) when already at or below the floor.
 */
export function applyAutoMarkdown(
  currentPriceCents: number,
  pct: number,
  floorCents: number | null | undefined
): number {
  if (!Number.isFinite(currentPriceCents) || currentPriceCents <= 0) {
    throw new Error("invalid price");
  }
  if (!Number.isFinite(pct) || pct <= 0 || pct >= 1) {
    throw new Error("invalid markdown pct");
  }
  const floor = typeof floorCents === "number" && floorCents > 0 ? floorCents : 1;
  if (currentPriceCents <= floor) return currentPriceCents;
  const reduced = Math.round(currentPriceCents * (1 - pct));
  return Math.max(floor, reduced);
}

export function daysSince(iso: string): number {
  const ms = Date.now() - new Date(iso).getTime();
  return ms / (24 * 60 * 60 * 1000);
}
