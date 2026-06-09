import type { CardImage, CardImageSource, TrustedCardImage } from "@/types";

const PLACEHOLDER_HOSTS = new Set([
  "placehold.co",
  "placehold.it",
  "via.placeholder.com",
]);
// Hosts we never trust for card images. `cert-images.psa.com` is NXDOMAIN —
// it does not resolve. Third-party providers (e.g. TCGAPIs) fabricate URLs in
// the `cert-images.psa.com/{cert}/large/{cert}_f.jpg` shape that never load.
// PSA's real scans (via the GetImagesByCertNumber API) are served from
// CloudFront, which is not blocked. See lib/images/psa-cert.ts.
const BLOCKED_IMAGE_HOSTS = new Set(["cert-images.psa.com"]);

export function normalizeHttpUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return /^https?:\/\//i.test(trimmed) ? trimmed : null;
}

export function normalizeCertDigits(value: unknown, minLength = 5): string | null {
  if (typeof value !== "string") return null;
  const digits = value.replace(/\D/g, "");
  return digits.length >= minLength ? digits : null;
}

export function buildPsaFrontImageUrl(value: unknown): string | null {
  return null;
}

export function buildClientImageUrl(value: unknown): string | null {
  const url = normalizeTrustedImageUrl(value);
  return url;
}

export function isPlaceholderImageUrl(value: unknown): boolean {
  const url = normalizeHttpUrl(value);
  if (!url) return false;

  try {
    const parsed = new URL(url);
    if (PLACEHOLDER_HOSTS.has(parsed.hostname)) return true;
    return parsed.searchParams.get("text")?.toLowerCase() === "card";
  } catch {
    return false;
  }
}

export function normalizeTrustedImageUrl(value: unknown): string | null {
  const url = normalizeHttpUrl(value);
  if (!url || isPlaceholderImageUrl(url)) return null;
  try {
    const parsed = new URL(url);
    if (BLOCKED_IMAGE_HOSTS.has(parsed.hostname)) return null;
  } catch {
    return null;
  }
  return url;
}

export function uniqueTrustedImageUrls(values: Array<unknown>): string[] {
  const seen = new Set<string>();
  const urls: string[] = [];

  for (const value of values) {
    const normalized = normalizeTrustedImageUrl(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    urls.push(normalized);
  }

  return urls;
}

export function resolveStoredImagePath(
  storagePath: string | null | undefined,
  getPublicUrl: (path: string) => string
): string | null {
  const httpUrl = normalizeTrustedImageUrl(storagePath ?? null);
  if (httpUrl) return httpUrl;

  if (!storagePath || !storagePath.trim()) {
    return null;
  }

  return normalizeTrustedImageUrl(getPublicUrl(storagePath));
}

function scoreCardImageLabel(label: string | null | undefined): number {
  const normalized = (label ?? "").trim().toLowerCase();
  if (normalized === "front") return 0;
  if (normalized === "back") return 1;
  return 2;
}

export function sortCardImages(images: CardImage[]): CardImage[] {
  return [...images].sort((a, b) => {
    const labelDelta = scoreCardImageLabel(a.label) - scoreCardImageLabel(b.label);
    if (labelDelta !== 0) return labelDelta;
    return a.position - b.position;
  });
}

export function pickUserCardImages(
  images: CardImage[],
  fallbacks?: {
    legacyUserImageUrl?: string | null;
    derivedImageUrl?: string | null;
    imageSource?: CardImageSource | null;
  }
): { frontUrl: string | null; backUrl: string | null } {
  const sorted = sortCardImages(images);
  const frontLabeled = sorted.find((image) => image.label === "front")?.url ?? null;
  const backLabeled = sorted.find((image) => image.label === "back")?.url ?? null;
  const ordered = sorted.map((image) => image.url).filter(Boolean) as string[];

  const legacyUserFront = normalizeTrustedImageUrl(fallbacks?.legacyUserImageUrl ?? null);
  const derivedUrl =
    fallbacks?.imageSource === "user"
      ? normalizeTrustedImageUrl(fallbacks?.derivedImageUrl ?? null)
      : null;

  const frontUrl =
    frontLabeled ||
    ordered[0] ||
    legacyUserFront ||
    derivedUrl ||
    null;

  const backUrl =
    backLabeled ||
    (ordered[1] ?? null);

  return { frontUrl, backUrl };
}

export function buildTrustedCardImage(input: {
  certFrontUrl?: string | null;
  certBackUrl?: string | null;
  certImageSource?: CardImageSource | null;
  userFrontUrl?: string | null;
  userBackUrl?: string | null;
}): TrustedCardImage {
  const frontCandidates = uniqueTrustedImageUrls([
    input.certFrontUrl,
    input.userFrontUrl,
  ]);
  const backCandidates = uniqueTrustedImageUrls([
    input.certBackUrl,
    input.userBackUrl,
  ]);

  const source: CardImageSource = frontCandidates[0] === normalizeTrustedImageUrl(input.certFrontUrl)
    ? input.certImageSource ?? "none"
    : frontCandidates[0] === normalizeTrustedImageUrl(input.userFrontUrl)
    ? "user"
    : "none";

  return {
    source,
    frontUrl: frontCandidates[0] ?? null,
    backUrl: backCandidates[0] ?? null,
    frontCandidates,
    backCandidates,
    hasFallbackCta: source === "none",
  };
}

export function getTrustedFrontImageUrl(image: TrustedCardImage | null | undefined): string | null {
  return image?.frontUrl ?? null;
}
