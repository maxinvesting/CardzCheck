export const DAY30_REDUCTION_RATE = 0.075;
export const DAY30_DAYS = 30;
export const DAY60_DAYS = 60;

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

export function daysSince(iso: string): number {
  const ms = Date.now() - new Date(iso).getTime();
  return ms / (24 * 60 * 60 * 1000);
}
