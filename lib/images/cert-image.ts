import type { CardImageSource } from "@/types";
import { normalizeCertDigits, normalizeTrustedImageUrl } from "@/lib/images/shared";

export type CertGrader = "PSA" | "BGS" | "SGC" | "CGC";
export type CertImageStatus = "queued" | "running" | "resolved" | "no_image" | "failed";

const CERT_GRADERS = new Set<CertGrader>(["PSA", "BGS", "SGC", "CGC"]);
const CERT_IMAGE_SOURCES = new Set<CardImageSource>(["psa", "bgs", "sgc", "cgc"]);
const CERT_PAGE_HOSTS = new Set([
  "www.psacard.com",
  "psacard.com",
  "www.beckett.com",
  "beckett.com",
  "www.gosgc.com",
  "gosgc.com",
  "www.cgccards.com",
  "cgccards.com",
]);

export function normalizeCertGrader(value: unknown): CertGrader | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  return CERT_GRADERS.has(normalized as CertGrader)
    ? (normalized as CertGrader)
    : null;
}

export function normalizeCertNumberForGrader(
  value: unknown,
  grader: CertGrader | null | undefined
): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const digits = normalizeCertDigits(trimmed, 5);
  if (digits) return digits;

  // Preserve compact alphanumeric values for graders that may expose them.
  const compact = trimmed.replace(/\s+/g, "").toUpperCase();
  if (compact.length < 3) return null;

  return grader ? compact : null;
}

export function normalizeCertWriteFields(input: {
  grading_company?: unknown;
  cert_number?: unknown;
  psa_cert_number?: unknown;
}): Partial<{
  grading_company: string | null;
  cert_number: string | null;
  psa_cert_number: string | null;
}> {
  const next: Partial<{
    grading_company: string | null;
    cert_number: string | null;
    psa_cert_number: string | null;
  }> = {};

  const hasGrader = "grading_company" in input;
  const hasCertNumber = "cert_number" in input;
  const hasPsaCertNumber = "psa_cert_number" in input;

  const normalizedGrader = normalizeCertGrader(input.grading_company);
  if (hasGrader) {
    next.grading_company =
      normalizedGrader ??
      (typeof input.grading_company === "string" && input.grading_company.trim()
        ? input.grading_company.trim()
        : null);
  }

  if (hasCertNumber || hasPsaCertNumber || hasGrader) {
    const rawCert = hasCertNumber ? input.cert_number : input.psa_cert_number;
    const normalizedCert = normalizeCertNumberForGrader(rawCert, normalizedGrader);
    if (hasCertNumber || hasGrader) {
      next.cert_number = normalizedCert;
    }
    if (hasPsaCertNumber || hasGrader || normalizedGrader === "PSA") {
      next.psa_cert_number =
        normalizedGrader === "PSA"
          ? normalizeCertNumberForGrader(
              hasPsaCertNumber ? input.psa_cert_number : rawCert,
              "PSA"
            )
          : null;
    }
  }

  return next;
}

export function certImageSourceForGrader(grader: CertGrader): CardImageSource {
  return grader.toLowerCase() as CardImageSource;
}

export function isCertImageSource(source: unknown): source is CardImageSource {
  return typeof source === "string" && CERT_IMAGE_SOURCES.has(source as CardImageSource);
}

export function buildCertPageUrl(params: { grader: CertGrader; certNumber: string }): string {
  const cert = encodeURIComponent(params.certNumber);
  switch (params.grader) {
    case "PSA":
      return `https://www.psacard.com/cert/${cert}/psa`;
    case "BGS":
      return `https://www.beckett.com/grading/card-lookup?item_id=${cert}&item_type=BGS`;
    case "SGC":
      return `https://www.gosgc.com/cert-code-lookup`;
    case "CGC":
      return `https://www.cgccards.com/certlookup`;
    default:
      return `https://www.psacard.com/cert/${cert}/psa`;
  }
}

export function getItemCertGrader(item: {
  grading_company?: string | null;
  image_source?: CardImageSource | null;
}): CertGrader | null {
  return normalizeCertGrader(item.grading_company ?? null) ??
    (item.image_source === "psa"
      ? "PSA"
      : item.image_source === "bgs"
      ? "BGS"
      : item.image_source === "sgc"
      ? "SGC"
      : item.image_source === "cgc"
      ? "CGC"
      : null);
}

export function getItemCertNumber(item: {
  grading_company?: string | null;
  cert_number?: string | null;
  psa_cert_number?: string | null;
}): string | null {
  const grader = normalizeCertGrader(item.grading_company ?? null);
  return normalizeCertNumberForGrader(
    item.cert_number ?? item.psa_cert_number ?? null,
    grader
  ) ?? normalizeCertNumberForGrader(item.psa_cert_number ?? null, grader);
}

export function isPendingCertImageStatus(status: unknown): status is "queued" | "running" {
  return status === "queued" || status === "running";
}

export function isCertImageStatus(status: unknown): status is CertImageStatus {
  return (
    status === "queued" ||
    status === "running" ||
    status === "resolved" ||
    status === "no_image" ||
    status === "failed"
  );
}

export function isUsableResolvedCertImageUrl(value: unknown): value is string {
  const url = normalizeTrustedImageUrl(value);
  if (!url) return false;

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;

    const pathname = parsed.pathname.toLowerCase();
    const hasImageExtension = /\.(avif|gif|jpe?g|png|webp)(\?|$)/.test(pathname);
    const looksLikeAssetPath =
      hasImageExtension ||
      pathname.includes("/image") ||
      pathname.includes("/images/") ||
      pathname.includes("/media/") ||
      pathname.includes("/cdn-cgi/image/") ||
      parsed.hostname.endsWith("cloudfront.net");

    if (!looksLikeAssetPath) return false;
    if (CERT_PAGE_HOSTS.has(parsed.hostname) && !hasImageExtension) return false;
    if (/\/cert(\/|$)|\/card-lookup(\/|$)|\/certlookup(\/|$)/.test(pathname) && !hasImageExtension) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}
