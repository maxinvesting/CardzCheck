import { CARD_SETS, CARD_VARIANTS } from "@/lib/card-data";

// Basic text normalization used across helpers
export function normalizeText(input: string | undefined | null): string {
  if (!input) return "";
  return input.toLowerCase().trim().replace(/\s+/g, " ");
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

export function capitalizeWords(input: string): string {
  return input
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

