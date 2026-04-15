import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
import { normalizeTrustedImageUrl } from "@/lib/images/shared";

export type PsaCertCacheStatus = "found" | "no_image" | "invalid" | "error";

export interface PsaCertLookupResult {
  certNumber: string;
  status: PsaCertCacheStatus;
  frontImageUrl: string | null;
  backImageUrl: string | null;
  payload: unknown;
  lastError: string | null;
}

type PsaCertCacheRow = {
  cert_number: string;
  status: PsaCertCacheStatus;
  front_image_url: string | null;
  back_image_url: string | null;
  payload: unknown;
  expires_at: string;
  last_error: string | null;
};

const PSA_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const PSA_ERROR_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const PSA_CERT_URL_BASE = "https://api.psacard.com/publicapi/cert/GetByCertNumber";

/** Minimum digit length for PSA cert lookup (matches app/api/psa/lookup). */
const MIN_CERT_DIGITS = 5;

/**
 * Normalize to digits-only cert number for API + CDN URLs.
 * Stored values may include labels (e.g. "Cert #120344868"); the PSA API path is numeric only.
 */
export function normalizePsaCertNumber(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const digits = value.replace(/\D/g, "");
  return digits.length >= MIN_CERT_DIGITS ? digits : null;
}

/**
 * PSA serves slab scans on a predictable CDN; these work without PSA API credentials.
 * Used when the JSON payload does not include image URLs our parser recognizes.
 */
export function buildPsaCertCdnImageUrls(certDigits: string): {
  frontImageUrl: string | null;
  backImageUrl: string | null;
} {
  const n = certDigits.replace(/\D/g, "");
  if (n.length < MIN_CERT_DIGITS) {
    return { frontImageUrl: null, backImageUrl: null };
  }
  const base = `https://cert-images.psa.com/${n}/large`;
  const front = `${base}/${n}_f.jpg`;
  const back = `${base}/${n}_b.jpg`;
  return {
    frontImageUrl: normalizeTrustedImageUrl(front),
    backImageUrl: normalizeTrustedImageUrl(back),
  };
}

function mergeWithCdnFallback(
  certDigits: string,
  front: string | null,
  back: string | null
): { frontImageUrl: string | null; backImageUrl: string | null } {
  const cdn = buildPsaCertCdnImageUrls(certDigits);
  return {
    frontImageUrl: front ?? cdn.frontImageUrl,
    backImageUrl: back ?? cdn.backImageUrl,
  };
}

function parseCertPageForImageUrls(html: string, certDigits: string): {
  frontImageUrl: string | null;
  backImageUrl: string | null;
} {
  const rawMatches = html.match(/https?:\/\/[^"'\\s)]+/g) ?? [];
  const urls = rawMatches
    .map((value) => normalizeTrustedImageUrl(value))
    .filter((value): value is string => Boolean(value))
    .filter((url) => {
      const lower = url.toLowerCase();
      return (
        /\.(jpg|jpeg|png|webp)(\?|$)/.test(lower) &&
        (lower.includes("cert") ||
          lower.includes("scan") ||
          lower.includes("image") ||
          lower.includes(certDigits))
      );
    });

  const pickBy = (slot: "front" | "back"): string | null => {
    const winner =
      urls.find((url) =>
        slot === "front"
          ? /(_f\.|_front\.|front|obverse)/i.test(url)
          : /(_b\.|_back\.|back|reverse)/i.test(url)
      ) ?? null;
    return winner;
  };

  return {
    frontImageUrl: pickBy("front"),
    backImageUrl: pickBy("back"),
  };
}

async function fetchPsaCertPageImageUrls(certDigits: string): Promise<{
  frontImageUrl: string | null;
  backImageUrl: string | null;
}> {
  try {
    const response = await fetch(`https://www.psacard.com/cert/${encodeURIComponent(certDigits)}`, {
      headers: { Accept: "text/html" },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return { frontImageUrl: null, backImageUrl: null };
    const html = await response.text();
    return parseCertPageForImageUrls(html, certDigits);
  } catch {
    return { frontImageUrl: null, backImageUrl: null };
  }
}

function nowIso(offsetMs = 0): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

function isExpired(expiresAt: string | null | undefined): boolean {
  if (!expiresAt) return true;
  const parsed = Date.parse(expiresAt);
  return !Number.isFinite(parsed) || parsed <= Date.now();
}

function extractImageCandidates(value: unknown): Array<{ path: string; url: string }> {
  const candidates: Array<{ path: string; url: string }> = [];

  const walk = (node: unknown, path: string[]) => {
    if (Array.isArray(node)) {
      node.forEach((entry, index) => walk(entry, [...path, String(index)]));
      return;
    }

    if (!node || typeof node !== "object") {
      if (typeof node === "string") {
        const url = normalizeTrustedImageUrl(node);
        if (!url) return;
        const joined = path.join(".").toLowerCase();
        const directPsaImage =
          /cert-images\.psa\.com\//i.test(url) ||
          /\/(small|large)\/[^/]+_[fb]\.(jpg|jpeg|png)(\?|$)/i.test(url);
        if (!/(image|photo|scan|front|back|obverse|reverse)/.test(joined) && !directPsaImage) {
          return;
        }
        candidates.push({
          path: directPsaImage ? `${joined}.psa_image_url` : joined,
          url,
        });
      }
      return;
    }

    for (const [key, child] of Object.entries(node)) {
      walk(child, [...path, key]);
    }
  };

  walk(value, []);
  return candidates;
}

function pickBestCandidate(
  candidates: Array<{ path: string; url: string }>,
  slot: "front" | "back"
): string | null {
  const scored = candidates
    .map((candidate) => {
      let score = 0;
      if (slot === "front" && /(front|obverse)/.test(candidate.path)) score += 100;
      if (slot === "back" && /(back|reverse)/.test(candidate.path)) score += 100;
      if (/(image|photo|scan)/.test(candidate.path)) score += 20;
      if (/(thumb|thumbnail)/.test(candidate.path)) score -= 80;
      if (/(icon|logo)/.test(candidate.path)) score -= 200;
      return { ...candidate, score };
    })
    .sort((a, b) => b.score - a.score);

  return scored[0] && scored[0].score > 0 ? scored[0].url : null;
}

export function extractPsaImageUrls(payload: unknown): {
  frontImageUrl: string | null;
  backImageUrl: string | null;
} {
  const candidates = extractImageCandidates(payload);
  return {
    frontImageUrl: pickBestCandidate(candidates, "front"),
    backImageUrl: pickBestCandidate(candidates, "back"),
  };
}

function detectInvalidPayload(payload: unknown): boolean {
  const message =
    typeof payload === "string"
      ? payload
      : payload && typeof payload === "object"
      ? JSON.stringify(payload)
      : "";
  return /not found|invalid cert|does not exist|no cert/i.test(message);
}

async function readCachedLookup(certNumber: string): Promise<PsaCertLookupResult | null> {
  try {
    const supabase = await createServiceClient();
    const { data, error } = await supabase
      .from("psa_cert_cache")
      .select("cert_number,status,front_image_url,back_image_url,payload,expires_at,last_error")
      .eq("cert_number", certNumber)
      .maybeSingle();

    if (error || !data || isExpired((data as PsaCertCacheRow).expires_at)) {
      return null;
    }

    const row = data as PsaCertCacheRow;
    return {
      certNumber: row.cert_number,
      status: row.status,
      frontImageUrl: normalizeTrustedImageUrl(row.front_image_url),
      backImageUrl: normalizeTrustedImageUrl(row.back_image_url),
      payload: row.payload,
      lastError: row.last_error,
    };
  } catch {
    return null;
  }
}

async function writeCachedLookup(result: PsaCertLookupResult): Promise<void> {
  try {
    const supabase = await createServiceClient();
    const expiresAt =
      result.status === "found" || result.status === "no_image"
        ? nowIso(PSA_CACHE_TTL_MS)
        : nowIso(PSA_ERROR_CACHE_TTL_MS);

    await supabase.from("psa_cert_cache").upsert({
      cert_number: result.certNumber,
      status: result.status,
      front_image_url: result.frontImageUrl,
      back_image_url: result.backImageUrl,
      payload: result.payload,
      fetched_at: nowIso(),
      expires_at: expiresAt,
      last_error: result.lastError,
    });
  } catch {
    // Best-effort cache.
  }
}

/** Add PSA CDN slab URLs when JSON parsing missed images (or older cache rows pre-CDN). */
function enrichResultWithCdn(
  certDigits: string,
  result: PsaCertLookupResult
): PsaCertLookupResult {
  if (result.status === "invalid") return result;

  const { frontImageUrl, backImageUrl } = mergeWithCdnFallback(
    certDigits,
    result.frontImageUrl,
    result.backImageUrl
  );
  if (
    frontImageUrl === result.frontImageUrl &&
    backImageUrl === result.backImageUrl
  ) {
    return result;
  }

  const hasImages = Boolean(frontImageUrl || backImageUrl);
  return {
    ...result,
    frontImageUrl,
    backImageUrl,
    status: hasImages ? "found" : result.status,
    lastError: hasImages ? null : result.lastError,
  };
}

async function enrichWithAllFallbacks(
  certDigits: string,
  frontImageUrl: string | null,
  backImageUrl: string | null
): Promise<{ frontImageUrl: string | null; backImageUrl: string | null }> {
  const cdnMerged = mergeWithCdnFallback(certDigits, frontImageUrl, backImageUrl);
  if (cdnMerged.frontImageUrl || cdnMerged.backImageUrl) {
    return cdnMerged;
  }

  const pageImages = await fetchPsaCertPageImageUrls(certDigits);
  return {
    frontImageUrl: pageImages.frontImageUrl ?? cdnMerged.frontImageUrl,
    backImageUrl: pageImages.backImageUrl ?? cdnMerged.backImageUrl,
  };
}

export async function fetchPsaCertLookup(
  rawCertNumber: string | null | undefined
): Promise<PsaCertLookupResult | null> {
  const certNumber = normalizePsaCertNumber(rawCertNumber);
  if (!certNumber) return null;

  const cached = await readCachedLookup(certNumber);
  if (cached) {
    const enriched = enrichResultWithCdn(certNumber, cached);
    if (
      enriched.frontImageUrl !== cached.frontImageUrl ||
      enriched.backImageUrl !== cached.backImageUrl ||
      enriched.status !== cached.status
    ) {
      await writeCachedLookup(enriched);
    }
    return enriched;
  }

  const token = (process.env.PSA_ACCESS_TOKEN ?? process.env.PSA_API_TOKEN)?.trim();
  if (!token) {
    const { frontImageUrl, backImageUrl } = await enrichWithAllFallbacks(certNumber, null, null);
    const result: PsaCertLookupResult = {
      certNumber,
      status: frontImageUrl || backImageUrl ? "found" : "no_image",
      frontImageUrl,
      backImageUrl,
      payload: null,
      lastError: null,
    };
    await writeCachedLookup(result);
    return result;
  }

  let payload: unknown = null;

  try {
    const response = await fetch(`${PSA_CERT_URL_BASE}/${encodeURIComponent(certNumber)}`, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        "X-Api-Key": token,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });

    payload = await response.json().catch(() => null);

    if (response.status === 404) {
      const result: PsaCertLookupResult = {
        certNumber,
        status: "invalid",
        frontImageUrl: null,
        backImageUrl: null,
        payload,
        lastError: "PSA cert not found",
      };
      await writeCachedLookup(result);
      return result;
    }

    if (!response.ok) {
      const merged = await enrichWithAllFallbacks(certNumber, null, null);
      const hasCdn = Boolean(merged.frontImageUrl || merged.backImageUrl);
      const result: PsaCertLookupResult = {
        certNumber,
        status: hasCdn ? "found" : "error",
        frontImageUrl: merged.frontImageUrl,
        backImageUrl: merged.backImageUrl,
        payload,
        lastError: hasCdn
          ? null
          : `PSA API request failed with status ${response.status}`,
      };
      await writeCachedLookup(result);
      return result;
    }

    const extracted = extractPsaImageUrls(payload);
    const merged = await enrichWithAllFallbacks(
      certNumber,
      extracted.frontImageUrl,
      extracted.backImageUrl
    );
    const { frontImageUrl, backImageUrl } = merged;

    const result: PsaCertLookupResult = {
      certNumber,
      status:
        frontImageUrl || backImageUrl
          ? "found"
          : detectInvalidPayload(payload)
          ? "invalid"
          : "no_image",
      frontImageUrl,
      backImageUrl,
      payload,
      lastError:
        frontImageUrl || backImageUrl
          ? null
          : detectInvalidPayload(payload)
          ? "PSA cert not found"
          : "PSA cert response did not contain usable images",
    };
    await writeCachedLookup(result);
    return result;
  } catch (error) {
    const merged = await enrichWithAllFallbacks(certNumber, null, null);
    const hasCdn = Boolean(merged.frontImageUrl || merged.backImageUrl);
    const result: PsaCertLookupResult = {
      certNumber,
      status: hasCdn ? "found" : "error",
      frontImageUrl: merged.frontImageUrl,
      backImageUrl: merged.backImageUrl,
      payload,
      lastError: hasCdn
        ? null
        : error instanceof Error
        ? error.message
        : "Unknown PSA API error",
    };
    await writeCachedLookup(result);
    return result;
  }
}
