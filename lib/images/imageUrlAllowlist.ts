/**
 * SSRF guard for server-side image fetches.
 *
 * Several endpoints download an image from a URL the client supplies (bulk
 * intake, grade-scan analysis) and feed the bytes to the AI. Without a host
 * allowlist, an attacker can point those URLs at internal services, cloud
 * metadata (169.254.169.254 / metadata.google.internal), or localhost — a
 * classic Server-Side Request Forgery, made worse here because the fetched
 * content is summarized back through the model.
 *
 * Legitimate images only ever come from our own Supabase Storage uploads
 * (*.supabase.co) or eBay stock images (*.ebayimg.com, already trusted in
 * next.config.js remotePatterns). Restricting outbound fetches to those hosts,
 * over HTTPS only, removes the SSRF surface while leaving real flows intact.
 */

export const ALLOWED_IMAGE_HOSTS = [
  "supabase.co",
  "supabase.in",
  "ebayimg.com",
] as const;

/**
 * Returns true only for `https://` URLs whose host is one of the allowlisted
 * hosts (or a subdomain of one). Everything else — http, other schemes,
 * private IPs, internal hostnames — is rejected.
 */
export function isAllowedImageUrl(rawUrl: unknown): rawUrl is string {
  if (typeof rawUrl !== "string") return false;

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }

  if (parsed.protocol !== "https:") return false;

  const host = parsed.hostname.toLowerCase();
  return ALLOWED_IMAGE_HOSTS.some(
    (allowed) => host === allowed || host.endsWith(`.${allowed}`)
  );
}
