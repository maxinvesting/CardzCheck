import { CARD_SETS, CARD_VARIANTS } from "@/lib/card-data";

// Basic text normalization used across helpers.
// - lowercase
// - remove punctuation (keep "/" for serials like /99)
// - collapse whitespace
// - apply a tiny synonym map (CJ/RC/PSA10, etc.)
export function normalizeText(input: string | undefined | null): string {
  if (!input) return "";
  let text = input.toLowerCase();

  // Remove punctuation but preserve "/" for serial numbers like /99
  text = text.replace(/[^a-z0-9/\s]/g, " ");
  text = text.replace(/\s+/g, " ").trim();

  // Synonyms / normalization
  // CJ <-> C J <-> C.J.
  text = text.replace(/\bc\s+j\b/g, "cj");
  // RC <-> Rookie
  text = text.replace(/\brc\b/g, "rookie");
  // PSA10 / BGS95 / SGC10 -> "psa 10" etc
  text = text.replace(/\b(psa|bgs|sgc|cgc)\s*([0-9]+(?:\.[0-9]+)?)\b/g, "$1 $2");

  return text;
}

export function expandSynonyms(input: string): string {
  // Expand a few key synonyms for search text (keeps the original tokens too)
  const norm = normalizeText(input);
  const tokens = norm.split(/\s+/).filter(Boolean);
  const expanded: string[] = [...tokens];

  if (tokens.includes("cj")) {
    expanded.push("c", "j");
  }
  if (tokens.includes("rookie")) {
    expanded.push("rc");
  }

  // Expand PSA/BGS/SGC/CGC grade into compact form (psa10)
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const next = tokens[i + 1];
    if (["psa", "bgs", "sgc", "cgc"].includes(token) && next && /^[0-9]+(?:\.[0-9]+)?$/.test(next)) {
      expanded.push(`${token}${next}`);
    }
  }

  return Array.from(new Set(expanded)).join(" ");
}

export function tokenize(input: string): string[] {
  return normalizeText(input)
    .split(/\s+/)
    .filter(Boolean);
}

export interface NormalizedBrandLine {
  brand?: string;
  line?: string;
}

/**
 * Very small, conservative synonym map for brands and lines.
 * This is intentionally simple – we mostly care about Donruss/Optic/Prizm/Select/Contenders/Mosaic.
 */
const BRAND_KEYWORDS: Record<string, string> = {
  panini: "Panini",
  topps: "Topps",
  fleer: "Fleer",
  donruss: "Donruss",
  upperdeck: "Upper Deck",
};

const LINE_KEYWORDS: Record<string, string> = {
  optic: "Optic",
  prizm: "Prizm",
  select: "Select",
  contenders: "Contenders",
  mosaic: "Mosaic",
  phoenix: "Phoenix",
  chrome: "Chrome",
};

/**
 * Extract brand/line from a free-form set name or listing title.
 * Examples:
 *  - "2024 Donruss Optic Football" -> { brand: "Donruss", line: "Optic" }
 *  - "2024 Panini Prizm" -> { brand: "Panini", line: "Prizm" }
 *  - "Panini Contenders Draft Picks" -> { brand: "Panini", line: "Contenders" }
 */
export function extractBrandAndLine(source: string): NormalizedBrandLine {
  const tokens = tokenize(source);
  let brand: string | undefined;
  let line: string | undefined;

  for (const raw of tokens) {
    const t = raw.replace(/[^a-z0-9]/gi, "").toLowerCase();
    if (!brand) {
      const brandMatch = BRAND_KEYWORDS[t];
      if (brandMatch) {
        brand = brandMatch;
        continue;
      }
    }
    if (!line) {
      const lineMatch = LINE_KEYWORDS[t];
      if (lineMatch) {
        line = lineMatch;
        continue;
      }
    }
  }

  // Fallback: try matching against known CARD_SETS
  if (!brand || !line) {
    const sourceNorm = normalizeText(source);
    for (const set of CARD_SETS) {
      const setNorm = normalizeText(set.name);
      if (sourceNorm.includes(setNorm) || setNorm.includes(sourceNorm)) {
        // Very rough split: assume first token is brand, last interesting token is line
        const parts = tokenize(set.name);
        if (!brand) {
          const brandCandidate = parts[0];
          const brandNorm = brandCandidate.replace(/[^a-z0-9]/gi, "").toLowerCase();
          brand = BRAND_KEYWORDS[brandNorm] ?? capitalizeWords(brandCandidate);
        }
        if (!line && parts.length > 1) {
          const lineCandidate = parts[parts.length - 1];
          const lineNorm = lineCandidate.replace(/[^a-z0-9]/gi, "").toLowerCase();
          line = LINE_KEYWORDS[lineNorm] ?? capitalizeWords(lineCandidate);
        }
        break;
      }
    }
  }

  return { brand, line };
}

export function extractYear(source: string): string | undefined {
  const match = source.match(/\b(19|20)\d{2}\b/);
  return match ? match[0] : undefined;
}

export function extractCardNumber(source: string): string | undefined {
  // Look for patterns like "#4", "No. 4", "Card 4"
  const hashMatch = source.match(/#\s*([A-Za-z0-9-]+)/);
  if (hashMatch) return `#${hashMatch[1]}`;

  const noMatch = source.match(/\b(?:no\.?|number|card)\s*([A-Za-z0-9-]+)/i);
  if (noMatch) return `#${noMatch[1]}`;

  return undefined;
}

const PARALLEL_KEYWORDS = CARD_VARIANTS.map(normalizeText).filter(Boolean);

export function extractParallel(source: string): string | undefined {
  const norm = normalizeText(source);
  for (const variant of PARALLEL_KEYWORDS) {
    if (!variant) continue;
    const parts = variant.split(" ");
    const allPresent = parts.every((p) => norm.includes(p));
    if (allPresent) {
      return capitalizeWords(variant);
    }
  }
  return undefined;
}

export interface GraderAndGrade {
  grader?: string;
  grade?: string;
}

export function extractGraderAndGrade(source: string): GraderAndGrade {
  const norm = normalizeText(source);
  const match = norm.match(/\b(psa|bgs|sgc|cgc)\s+([0-9]+(?:\.[0-9]+)?)\b/);
  if (!match) return {};
  return {
    grader: match[1].toUpperCase(),
    grade: match[2],
  };
}

export function capitalizeWords(input: string): string {
  return input
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}
