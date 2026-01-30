import { normalizeText } from "@/lib/smartSearch/normalize";
import type { QueryIntent } from "./types";

const PRODUCT_KEYWORDS = [
  "prizm",
  "optic",
  "select",
  "mosaic",
  "donruss",
  "chronicles",
  "contenders",
  "phoenix",
] as const;

const INSERT_KEYWORDS = [
  "rated rookie",
  "downtown",
  "my house",
  "kaboom",
  "rookies & stars",
] as const;

const PARALLEL_KEYWORDS = [
  "silver",
  "holo",
  "hollow",
  "red",
  "blue",
  "green",
  "gold",
  "purple",
  "orange",
  "pink",
  "black",
  "pulsar",
  "checkerboard",
  "mojo",
  "wave",
  "/199",
  "/99",
  "/75",
  "/50",
  "/25",
  "/10",
  "/5",
  "/1",
] as const;

const DRAFT_COLLEGE_KEYWORDS = [
  "draft picks",
  "draft",
  "college",
  "collegiate",
  "ncaa",
  "university",
  "campus",
] as const;

const NOISE_KEYWORDS = [
  "card",
  "cards",
  "rookie card",
  "rc",
  "psa",
  "bgs",
  "sgc",
  "cgc",
  "lot",
  "investment",
  "hot",
  "🔥",
] as const;

const SYNONYM_MAP: Record<string, string> = {
  rr: "rated rookie",
  "rated rookies": "rated rookie",
  "silver prism": "silver",
  "silver prizm": "silver",
};

export function parseQuery(raw: string): QueryIntent {
  const normalized = normalizeBase(raw);

  const yearMatch = normalized.match(/\b(19|20)\d{2}\b/);
  const year = yearMatch ? yearMatch[0] : undefined;

  // Apply simple phrase-level synonym replacements on the normalized string
  let working = normalized;
  for (const [from, to] of Object.entries(SYNONYM_MAP)) {
    const pattern = new RegExp(`\\b${escapeRegExp(from)}\\b`, "g");
    working = working.replace(pattern, to);
  }

  const tokens = working.split(/\s+/).filter(Boolean);

  const productTokens: string[] = [];
  const insertTokens: string[] = [];
  const parallelTokens: string[] = [];
  const noiseTokens: string[] = [];
  const genericTokens: string[] = [];

  let hasDraftOrCollegeSignal = false;
  let hasRookieKeyword = false;

  // Helper to peek at bigrams for insert phrases like "rated rookie"
  const getBigram = (idx: number) => {
    if (idx + 1 >= tokens.length) return "";
    return `${tokens[idx]} ${tokens[idx + 1]}`;
  };

  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];
    const bigram = getBigram(i);

    // Skip the year token from generic buckets – we'll store it separately
    if (token === year) {
      i += 1;
      continue;
    }

    // Draft / college signals
    if (matchesKeyword(bigram, DRAFT_COLLEGE_KEYWORDS) || matchesKeyword(token, DRAFT_COLLEGE_KEYWORDS)) {
      hasDraftOrCollegeSignal = true;
      if (matchesKeyword(bigram, DRAFT_COLLEGE_KEYWORDS)) {
        i += 2;
      } else {
        i += 1;
      }
      continue;
    }

    // Insert / family tokens (prefer bigram match, e.g. "rated rookie")
    if (matchesKeyword(bigram, INSERT_KEYWORDS)) {
      insertTokens.push(bigram);
      if (bigram === "rated rookie") {
        hasRookieKeyword = true;
      }
      i += 2;
      continue;
    }

    if (matchesKeyword(token, INSERT_KEYWORDS)) {
      insertTokens.push(token);
      if (token.includes("rookie")) {
        hasRookieKeyword = true;
      }
      i += 1;
      continue;
    }

    // Product tokens
    if (matchesKeyword(token, PRODUCT_KEYWORDS)) {
      productTokens.push(token);
      i += 1;
      continue;
    }

    // Parallel / color tokens
    if (matchesKeyword(token, PARALLEL_KEYWORDS)) {
      parallelTokens.push(token);
      i += 1;
      continue;
    }

    // Rookie generic (weak)
    if (token === "rookie" || token === "rc") {
      hasRookieKeyword = true;
      genericTokens.push(token);
      i += 1;
      continue;
    }

    // Noise tokens
    if (matchesKeyword(token, NOISE_KEYWORDS)) {
      noiseTokens.push(token);
      i += 1;
      continue;
    }

    genericTokens.push(token);
    i += 1;
  }

  // Heuristic: treat the first 2–3 generic tokens as player name tokens
  const playerTokens = genericTokens.slice(0, 3).filter((t) => !/\d/.test(t));

  const requestedProductLines = dedupe(productTokens);

  return {
    raw,
    normalized,
    year,
    playerTokens,
    productTokens: requestedProductLines,
    insertTokens: dedupe(insertTokens),
    parallelTokens: dedupe(parallelTokens),
    hasRookieKeyword,
    hasDraftOrCollegeSignal,
    noiseTokens: dedupe(noiseTokens),
    genericTokens,
    productSpecified: requestedProductLines.length > 0,
    requestedProductLines,
  };
}

function normalizeBase(raw: string): string {
  // Reuse smartSearch normalizeText where possible
  const lower = normalizeText(raw || "");
  return lower
    .replace(/[^\w\s/]/g, " ") // strip punctuation but keep slash for /199, etc.
    .replace(/\s+/g, " ")
    .trim();
}

function matchesKeyword(tokenOrPhrase: string, list: readonly string[]): boolean {
  if (!tokenOrPhrase) return false;
  const norm = tokenOrPhrase.toLowerCase();
  return list.some((kw) => norm === kw || norm.includes(kw));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function dedupe<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

