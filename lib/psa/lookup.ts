import { load } from "cheerio";

export interface PsaCertObject {
  CertNumber?: string;
  Subject?: string;
  Year?: string;
  Brand?: string;
  BrandTitle?: string;
  CardNumber?: string;
  CardNo?: string;
  GradeName?: string;
  CardGrade?: string;
  ItemGrade?: string;
  SpecLevel?: string;
  Variety?: string;
  ServerMessage?: string;
  IsValidRequest?: boolean;
  [key: string]: unknown;
}

export interface PsaMappedResult {
  player_name: string | null;
  year: string | null;
  set_name: string | null;
  card_number: string | null;
  grade: string | null;
  grading_company: "PSA";
  parallel_type: string | null;
}

const PSA_CERT_HINT_KEYS = [
  "CertNumber",
  "Subject",
  "Year",
  "Brand",
  "BrandTitle",
  "CardNumber",
  "CardNo",
  "GradeName",
  "CardGrade",
  "ItemGrade",
  "SpecLevel",
  "Variety",
];

function readFirstString(
  record: PsaCertObject,
  keys: ReadonlyArray<string>
): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function looksLikePsaCertObject(value: unknown): value is PsaCertObject {
  if (!isObjectRecord(value)) return false;
  return PSA_CERT_HINT_KEYS.some((key) => Object.prototype.hasOwnProperty.call(value, key));
}

export function getPsaServerMessage(payload: unknown): string | null {
  if (!isObjectRecord(payload)) return null;

  const direct = payload.ServerMessage;
  if (typeof direct === "string" && direct.trim()) {
    return direct.trim();
  }

  for (const value of Object.values(payload)) {
    if (typeof value === "string" && /request successful|no data found|invalid cert/i.test(value)) {
      return value.trim();
    }
  }

  return null;
}

export function isPsaNotFoundPayload(payload: unknown): boolean {
  const message = getPsaServerMessage(payload);
  return Boolean(message && /no data found|not found|does not exist/i.test(message));
}

export function isPsaInvalidRequestPayload(payload: unknown): boolean {
  const message = getPsaServerMessage(payload);
  if (message && /invalid cert|invalid request|too few/i.test(message)) {
    return true;
  }

  return isObjectRecord(payload) && payload.IsValidRequest === false;
}

export function findPsaCertObject(payload: unknown): PsaCertObject | null {
  if (!payload) return null;

  const stack: unknown[] = [payload];
  const visited = new Set<object>();

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || typeof current !== "object") continue;
    if (visited.has(current)) continue;
    visited.add(current);

    if (looksLikePsaCertObject(current)) {
      return current;
    }

    if (Array.isArray(current)) {
      for (const entry of current) stack.push(entry);
      continue;
    }

    for (const value of Object.values(current)) {
      if (value && typeof value === "object") {
        stack.push(value);
      }
    }
  }

  return null;
}

export function normalizePsaGradeLabel(cert: PsaCertObject): string | null {
  const rawGrade = readFirstString(cert, ["CardGrade", "ItemGrade", "GradeName"]);
  if (!rawGrade) return null;
  if (/^PSA\s/i.test(rawGrade)) return rawGrade;

  const numeric = rawGrade.match(/(\d+(?:\.\d+)?)/);
  if (numeric) return `PSA ${numeric[1]}`;
  return `PSA ${rawGrade}`;
}

export function mapPsaCert(cert: PsaCertObject): PsaMappedResult {
  return {
    player_name: readFirstString(cert, ["Subject"]),
    year: readFirstString(cert, ["Year"]),
    set_name: readFirstString(cert, ["Brand", "BrandTitle"]),
    card_number: readFirstString(cert, ["CardNumber", "CardNo"]),
    grade: normalizePsaGradeLabel(cert),
    grading_company: "PSA",
    parallel_type: readFirstString(cert, ["SpecLevel", "Variety"]),
  };
}

function normalizeHtmlLines(html: string): string[] {
  const $ = load(html);
  return $.root()
    .text()
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 0 && line !== "*");
}

function readHtmlLabelValue(lines: string[], label: string): string | null {
  const labelLower = label.toLowerCase();
  const index = lines.findIndex((line) => line.toLowerCase() === labelLower);
  if (index === -1) return null;

  for (let i = index + 1; i < Math.min(lines.length, index + 5); i += 1) {
    const candidate = lines[i];
    if (!candidate) continue;
    if (candidate.toLowerCase() === labelLower) continue;
    if (/^image:/i.test(candidate)) continue;
    return candidate;
  }

  return null;
}

export function parsePsaCertHtml(
  html: string,
  certNumber: string
): PsaMappedResult | null {
  if (!html.trim()) return null;
  if (/just a moment|enable javascript and cookies to continue/i.test(html)) {
    return null;
  }

  const lines = normalizeHtmlLines(html);
  const cert: PsaCertObject = {
    CertNumber: readHtmlLabelValue(lines, "Cert Number") ?? certNumber,
    ItemGrade: readHtmlLabelValue(lines, "Item Grade") ?? undefined,
    Year: readHtmlLabelValue(lines, "Year") ?? undefined,
    BrandTitle: readHtmlLabelValue(lines, "Brand/Title") ?? undefined,
    Subject: readHtmlLabelValue(lines, "Subject") ?? undefined,
    CardNumber: readHtmlLabelValue(lines, "Card Number") ?? undefined,
    Variety: readHtmlLabelValue(lines, "Variety/Pedigree") ?? undefined,
  };

  const mapped = mapPsaCert(cert);
  if (!mapped.player_name && !mapped.set_name && !mapped.card_number && !mapped.grade) {
    return null;
  }

  return mapped;
}

// ---------------------------------------------------------------------------
// Shared server-side lookup helper (used by bulk-cert + future callers).
// The single-cert route at app/api/psa/lookup intentionally has its own copy.
// ---------------------------------------------------------------------------

export type PsaLookupOutcome =
  | { status: "found"; mapped: PsaMappedResult }
  | { status: "not_found" }
  | { status: "invalid"; reason: string }
  | { status: "error"; reason: string };

export function normalizeCertInput(raw: string): string {
  return raw.trim().replace(/\D/g, "");
}

async function fetchPsaPublicCertPage(certDigits: string): Promise<PsaMappedResult | null> {
  const urls = [
    `https://www.psacard.com/cert/${encodeURIComponent(certDigits)}/psa`,
    `https://www.psacard.com/cert/${encodeURIComponent(certDigits)}`,
  ];

  for (const url of urls) {
    try {
      const response = await fetch(url, {
        headers: {
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "en-US,en;q=0.9",
          "User-Agent": "Mozilla/5.0 (compatible; CardzCheck PSA Lookup)",
        },
        cache: "no-store",
        redirect: "follow",
        signal: AbortSignal.timeout(8000),
      });

      if (!response.ok) continue;
      const html = await response.text();
      const parsed = parsePsaCertHtml(html, certDigits);
      if (parsed?.player_name || parsed?.set_name || parsed?.card_number) {
        return parsed;
      }
    } catch {
      // Best-effort fallback.
    }
  }

  return null;
}

export async function lookupPsaCert(rawCert: string): Promise<PsaLookupOutcome> {
  const certDigits = normalizeCertInput(rawCert);
  if (certDigits.length < 5) {
    return { status: "invalid", reason: "certNumber is too short" };
  }

  const token = (process.env.PSA_ACCESS_TOKEN ?? process.env.PSA_API_TOKEN)?.trim();
  if (!token) {
    const fallback = await fetchPsaPublicCertPage(certDigits);
    if (fallback) return { status: "found", mapped: fallback };
    return { status: "error", reason: "PSA lookup unavailable right now" };
  }

  let psaData: unknown = null;
  try {
    const res = await fetch(
      `https://api.psacard.com/publicapi/cert/GetByCertNumber/${encodeURIComponent(certDigits)}`,
      {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      }
    );

    if (res.status === 404 || res.status === 204) {
      return { status: "not_found" };
    }

    psaData = await res.json().catch(() => null);

    if (!res.ok) {
      const fallback = await fetchPsaPublicCertPage(certDigits);
      if (fallback) return { status: "found", mapped: fallback };
      return {
        status: "error",
        reason: getPsaServerMessage(psaData) ?? `PSA API error ${res.status}`,
      };
    }
  } catch (err) {
    const fallback = await fetchPsaPublicCertPage(certDigits);
    if (fallback) return { status: "found", mapped: fallback };
    return {
      status: "error",
      reason: err instanceof Error ? err.message : "PSA fetch failed",
    };
  }

  if (isPsaInvalidRequestPayload(psaData)) {
    return { status: "invalid", reason: getPsaServerMessage(psaData) ?? "Invalid cert" };
  }
  if (isPsaNotFoundPayload(psaData)) {
    return { status: "not_found" };
  }

  const cert = findPsaCertObject(psaData);
  if (!cert) {
    const fallback = await fetchPsaPublicCertPage(certDigits);
    if (fallback) return { status: "found", mapped: fallback };
    return {
      status: "error",
      reason: getPsaServerMessage(psaData) ?? "PSA response missing cert payload",
    };
  }

  const mapped = mapPsaCert(cert);
  if (!mapped.player_name && !mapped.set_name && !mapped.card_number) {
    return { status: "not_found" };
  }

  return { status: "found", mapped };
}
