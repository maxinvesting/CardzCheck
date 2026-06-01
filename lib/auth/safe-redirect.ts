/**
 * Returns the given path only if it is a safe same-origin relative path.
 * Rejects absolute URLs, protocol-relative URLs (//evil.com), and anything
 * that resolves to a different origin. Used by login + auth callback to
 * prevent open-redirect phishing.
 */
export function sanitizeNextPath(nextParam: string | null | undefined): string | null {
  if (!nextParam) return null;
  if (typeof nextParam !== "string") return null;
  if (!nextParam.startsWith("/") || nextParam.startsWith("//")) return null;

  try {
    const parsed = new URL(nextParam, "http://localhost");
    if (parsed.origin !== "http://localhost") return null;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}
