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

export function normalizePsaCertNumber(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\s+/g, "").trim();
  return normalized.length > 0 ? normalized : null;
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
        if (!/(image|photo|scan|front|back|obverse|reverse)/.test(joined)) return;
        candidates.push({ path: joined, url });
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

export async function fetchPsaCertLookup(
  rawCertNumber: string | null | undefined
): Promise<PsaCertLookupResult | null> {
  const certNumber = normalizePsaCertNumber(rawCertNumber);
  if (!certNumber) return null;

  const cached = await readCachedLookup(certNumber);
  if (cached) return cached;

  const token = (process.env.PSA_ACCESS_TOKEN ?? process.env.PSA_API_TOKEN)?.trim();
  if (!token) {
    return {
      certNumber,
      status: "error",
      frontImageUrl: null,
      backImageUrl: null,
      payload: null,
      lastError: "PSA_ACCESS_TOKEN or PSA_API_TOKEN is missing",
    };
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
      const result: PsaCertLookupResult = {
        certNumber,
        status: "error",
        frontImageUrl: null,
        backImageUrl: null,
        payload,
        lastError: `PSA API request failed with status ${response.status}`,
      };
      await writeCachedLookup(result);
      return result;
    }

    const { frontImageUrl, backImageUrl } = extractPsaImageUrls(payload);
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
