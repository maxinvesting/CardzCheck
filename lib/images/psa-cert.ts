import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
import { normalizeTrustedImageUrl } from "@/lib/images/shared";
import { readPsaToken } from "@/lib/psa/lookup";

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

// Slab scans are immutable, so a "found" result can serve forever — fetching a
// cert's images more than once only burns PSA's tiny daily image quota.
const PSA_FOUND_CACHE_TTL_MS = 365 * 24 * 60 * 60 * 1000;
// "No image on file" / "invalid" are stable enough to hold for a day.
const PSA_NEGATIVE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const PSA_ERROR_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
/**
 * The PSA Public API endpoint that returns the actual scans PSA captured at
 * grading. `GetByCertNumber` (used elsewhere for metadata) does NOT include
 * images — this is the only endpoint that does. Returns an array of
 * `{ IsFrontImage: boolean, ImageURL: string }` (CloudFront URLs).
 */
const PSA_CERT_IMAGES_URL_BASE =
  "https://api.psacard.com/publicapi/cert/GetImagesByCertNumber";

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
 * Recursively collect `{ IsFrontImage, ImageURL }` entries from the
 * GetImagesByCertNumber response. PSA returns a flat array, but we walk
 * defensively in case the payload is ever wrapped.
 */
function collectPsaApiImages(
  payload: unknown
): Array<{ isFront: boolean | null; url: string }> {
  const out: Array<{ isFront: boolean | null; url: string }> = [];

  const walk = (node: unknown) => {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (!node || typeof node !== "object") return;

    const record = node as Record<string, unknown>;
    const urlKey = Object.keys(record).find((key) => /^image_?url$/i.test(key));
    const urlValue = urlKey ? record[urlKey] : null;
    if (typeof urlValue === "string" && urlValue.trim()) {
      const frontKey = Object.keys(record).find((key) => /is_?front(_?image)?/i.test(key));
      const isFront =
        frontKey && typeof record[frontKey] === "boolean"
          ? (record[frontKey] as boolean)
          : null;
      out.push({ isFront, url: urlValue });
    }

    for (const value of Object.values(record)) {
      if (value && typeof value === "object") walk(value);
    }
  };

  walk(payload);
  return out;
}

/** Map PSA API image entries to front/back, falling back to document order. */
export function mapPsaApiImages(payload: unknown): {
  frontImageUrl: string | null;
  backImageUrl: string | null;
} {
  let frontImageUrl: string | null = null;
  let backImageUrl: string | null = null;
  const unassigned: string[] = [];

  for (const entry of collectPsaApiImages(payload)) {
    const url = normalizeTrustedImageUrl(entry.url);
    if (!url) continue;
    if (entry.isFront === true && !frontImageUrl) {
      frontImageUrl = url;
    } else if (entry.isFront === false && !backImageUrl) {
      backImageUrl = url;
    } else {
      unassigned.push(url);
    }
  }

  if (!frontImageUrl && unassigned.length > 0) frontImageUrl = unassigned.shift() ?? null;
  if (!backImageUrl && unassigned.length > 0) backImageUrl = unassigned.shift() ?? null;

  return { frontImageUrl, backImageUrl };
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
      result.status === "found"
        ? nowIso(PSA_FOUND_CACHE_TTL_MS)
        : result.status === "no_image" || result.status === "invalid"
        ? nowIso(PSA_NEGATIVE_CACHE_TTL_MS)
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

export async function fetchPsaCertLookup(
  rawCertNumber: string | null | undefined
): Promise<PsaCertLookupResult | null> {
  const certNumber = normalizePsaCertNumber(rawCertNumber);
  if (!certNumber) return null;

  const cached = await readCachedLookup(certNumber);
  if (cached) return cached;

  // Use the same multi-casing reader as the metadata lookup. Production stores
  // the token under a casing the two exact-uppercase names missed, which made
  // image fetches silently fall through to the no-token branch (metadata worked,
  // images came back empty).
  const token = readPsaToken();
  if (!token) {
    // PSA only serves cert scans to authenticated callers; without a token we
    // cannot produce images. Cache as no_image so we don't retry every render.
    const result: PsaCertLookupResult = {
      certNumber,
      status: "no_image",
      frontImageUrl: null,
      backImageUrl: null,
      payload: null,
      lastError: "PSA access token not configured",
    };
    await writeCachedLookup(result);
    return result;
  }

  let payload: unknown = null;

  try {
    const response = await fetch(
      `${PSA_CERT_IMAGES_URL_BASE}/${encodeURIComponent(certNumber)}`,
      {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      }
    );

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
      const result: PsaCertLookupResult = {
        certNumber,
        status: "error",
        frontImageUrl: null,
        backImageUrl: null,
        payload,
        lastError: `PSA images request failed with status ${response.status}`,
      };
      // A 429 (daily quota exhausted) is transient — caching it would freeze the
      // cert as "no scan" for 6h, so the scans never appear even once PSA's quota
      // resets. Return it uncached so the next attempt can succeed.
      if (response.status !== 429) {
        await writeCachedLookup(result);
      }
      return result;
    }

    const { frontImageUrl, backImageUrl } = mapPsaApiImages(payload);
    const hasImages = Boolean(frontImageUrl || backImageUrl);

    const result: PsaCertLookupResult = {
      certNumber,
      status: hasImages ? "found" : detectInvalidPayload(payload) ? "invalid" : "no_image",
      frontImageUrl,
      backImageUrl,
      payload,
      lastError: hasImages
        ? null
        : detectInvalidPayload(payload)
        ? "PSA cert not found"
        : "PSA has no images on file for this cert",
    };
    await writeCachedLookup(result);
    return result;
  } catch (error) {
    const result: PsaCertLookupResult = {
      certNumber,
      status: "error",
      frontImageUrl: null,
      backImageUrl: null,
      payload,
      lastError: error instanceof Error ? error.message : "Unknown PSA API error",
    };
    await writeCachedLookup(result);
    return result;
  }
}
