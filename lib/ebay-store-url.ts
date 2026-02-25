/**
 * Helpers for normalizing and validating eBay store URLs (used by Business page and Settings).
 */

export function normalizeEbayStoreUrl(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/**
 * Returns a valid https URL for the eBay store, or null if invalid.
 */
export function buildEbayStoreHref(value: string | null | undefined): string | null {
  const raw = normalizeEbayStoreUrl(value);
  if (!raw) return null;
  try {
    if (raw.startsWith("http://") || raw.startsWith("https://")) {
      const u = new URL(raw);
      if (u.protocol !== "http:" && u.protocol !== "https:") return null;
      return raw;
    }
    try {
      const parsedRaw = new URL(raw);
      if (parsedRaw.protocol && parsedRaw.protocol !== "http:" && parsedRaw.protocol !== "https:")
        return null;
    } catch {
      // raw is not a full URL; prepending https is fine
    }
    const withScheme = `https://${raw}`;
    const u = new URL(withScheme);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return withScheme;
  } catch {
    return null;
  }
}



