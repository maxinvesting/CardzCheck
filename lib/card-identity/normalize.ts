import { CARD_SETS } from "@/lib/card-data";
import { canonicalizeName, matchPlayerFromOcr } from "@/lib/card-identity/player-dictionary";
import type {
  CardIdentity,
  FieldConfidence,
  FieldSource,
  OcrSignals,
  OcrYearCandidate,
  VisionSignals,
} from "./types";

const YEAR_REGEX = /\b(19|20)\d{2}\b/g;

const BRAND_KEYWORDS = [
  "panini",
  "topps",
  "upper deck",
  "donruss",
  "bowman",
  "fleer",
  "score",
  "leaf",
  "skybox",
  "sp",
];

const SET_KEYWORDS = [
  "prizm",
  "mosaic",
  "select",
  "donruss optic",
  "optic",
  "contenders",
  "bowman chrome",
  "chrome",
  "finest",
  "national treasures",
  "immaculate",
  "flawless",
  "stadium club",
  "heritage",
  "topps update",
  "topps series",
];

const INSERT_KEYWORDS = [
  "downtown",
  "kaboom",
  "color blast",
  "stained glass",
  "case hit",
  "ssp",
  "sp",
];

const CHROMIUM_KEYWORDS = ["chrome", "refractor", "prizm", "optic", "select", "mosaic"];
const PAPER_KEYWORDS = ["donruss", "score", "topps", "bowman", "fleer", "upper deck"];

const CONFIDENCE_ORDER: FieldConfidence[] = ["low", "medium", "high"];

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function clampConfidence(value?: FieldConfidence | null): FieldConfidence {
  if (!value) return "low";
  if (value === "high" || value === "medium" || value === "low") return value;
  return "low";
}

function maxConfidence(a: FieldConfidence, b: FieldConfidence): FieldConfidence {
  return CONFIDENCE_ORDER[Math.max(CONFIDENCE_ORDER.indexOf(a), CONFIDENCE_ORDER.indexOf(b))];
}

function minConfidence(a: FieldConfidence, b: FieldConfidence): FieldConfidence {
  return CONFIDENCE_ORDER[Math.min(CONFIDENCE_ORDER.indexOf(a), CONFIDENCE_ORDER.indexOf(b))];
}

function scoreYearLine(line: string): number {
  const lower = line.toLowerCase();
  let score = 1;
  if (lower.includes("©") || lower.includes("copyright") || lower.includes("all rights reserved")) {
    score += 3;
  }
  if (
    lower.includes("panini") ||
    lower.includes("topps") ||
    lower.includes("upper deck") ||
    lower.includes("inc") ||
    lower.includes("ltd")
  ) {
    score += 2;
  }
  if (lower.includes("trading card") || lower.includes("printed") || lower.includes("licensed")) {
    score += 1;
  }
  if (lower.includes("back") || lower.includes("reverse")) {
    score += 1;
  }
  return score;
}

function parseYearCandidates(text: string): OcrYearCandidate[] {
  const candidates: OcrYearCandidate[] = [];
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  for (const line of lines) {
    const matches = line.matchAll(YEAR_REGEX);
    for (const match of matches) {
      const year = Number(match[0]);
      if (Number.isFinite(year)) {
        candidates.push({
          year,
          score: scoreYearLine(line),
          line,
        });
      }
    }
  }
  return candidates;
}

function pickTopYearCandidate(
  candidates: OcrYearCandidate[],
  currentYear: number
): { year?: number; confidence: FieldConfidence; warning?: string } {
  const maxYear = currentYear + 1;
  const scored = new Map<number, number>();
  for (const candidate of candidates) {
    if (candidate.year < 1900 || candidate.year > maxYear) continue;
    const existing = scored.get(candidate.year) ?? 0;
    scored.set(candidate.year, Math.max(existing, candidate.score));
  }

  const uniqueYears = Array.from(scored.entries()).map(([year, score]) => ({ year, score }));
  if (uniqueYears.length === 0) {
    return { confidence: "low" };
  }

  uniqueYears.sort((a, b) => b.score - a.score);

  if (uniqueYears.length === 1) {
    if (uniqueYears[0].score >= 4) {
      return { year: uniqueYears[0].year, confidence: "high" };
    }
    if (uniqueYears[0].score >= 2) {
      return { year: uniqueYears[0].year, confidence: "medium" };
    }
    return { year: uniqueYears[0].year, confidence: "low", warning: "year_needs_confirmation" };
  }

  const top = uniqueYears[0];
  const runnerUp = uniqueYears[1];
  if (top.score - runnerUp.score >= 2) {
    const confidence = top.score >= 4 ? "high" : "medium";
    return { year: top.year, confidence };
  }

  return { confidence: "low", warning: "year_ambiguous" };
}

function extractKeywordMatch(text: string, keywords: string[]): string | undefined {
  const normalized = normalizeText(text);
  for (const keyword of keywords) {
    const normalizedKeyword = normalizeText(keyword);
    if (normalized.includes(normalizedKeyword)) {
      return keyword
        .split(" ")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
    }
  }
  return undefined;
}

function normalizeOcrText(text: string): string {
  return text
    .toUpperCase()
    .replace(/[^A-Z\\s]/g, " ")
    .replace(/\\s+/g, " ")
    .trim();
}

function extractPlayerCandidates(text: string): string[] {
  const normalized = normalizeOcrText(text);
  if (!normalized) return [];
  const stopwords = new Set(
    [
      ...BRAND_KEYWORDS,
      ...SET_KEYWORDS,
      ...INSERT_KEYWORDS,
      "ROOKIE",
      "CARD",
      "BASE",
      "PRIZM",
      "MOSAIC",
      "SELECT",
      "OPTIC",
      "DONRUSS",
      "TOPPS",
      "PANINI",
      "UPPER",
      "DECK",
      "BOWMAN",
      "CHROME",
      "FOOTBALL",
      "BASKETBALL",
      "BASEBALL",
      "HOCKEY",
      "SOCCER",
      "COURT",
      "KINGS",
    ]
      .map((word) => word.toUpperCase())
  );

  const tokens = normalized.split(" ").filter(Boolean);
  const candidates: string[] = [];

  for (let i = 0; i < tokens.length - 1; i += 1) {
    const first = tokens[i];
    const second = tokens[i + 1];
    if (stopwords.has(first) || stopwords.has(second)) continue;
    if (first.length < 2 || second.length < 2) continue;
    candidates.push(canonicalizeName(`${first} ${second}`));
  }

  for (let i = 0; i < tokens.length - 2; i += 1) {
    const first = tokens[i];
    const second = tokens[i + 1];
    const third = tokens[i + 2];
    if (stopwords.has(first) || stopwords.has(second) || stopwords.has(third)) continue;
    if (first.length < 2 || second.length < 2 || third.length < 2) continue;
    candidates.push(canonicalizeName(`${first} ${second} ${third}`));
  }

  return Array.from(new Set(candidates));
}

function extractPlayerFromOcr(text: string): {
  player?: string;
  candidates: string[];
  confidence: FieldConfidence;
} {
  const dictionaryMatch = matchPlayerFromOcr(text);
  if (dictionaryMatch.player) {
    return {
      player: dictionaryMatch.player,
      candidates: [dictionaryMatch.player],
      confidence: dictionaryMatch.confidence,
    };
  }

  const candidates = extractPlayerCandidates(text);
  if (candidates.length > 0) {
    return {
      player: candidates[0],
      candidates,
      confidence: "medium",
    };
  }

  return { candidates: [], confidence: "low" };
}

function inferBrandFromSet(setName?: string): string | undefined {
  if (!setName) return undefined;
  const lower = setName.toLowerCase();
  if (lower.includes("panini")) return "Panini";
  if (lower.includes("topps")) return "Topps";
  if (lower.includes("upper deck")) return "Upper Deck";
  if (lower.includes("bowman")) return "Bowman";
  if (lower.includes("donruss")) return "Donruss";
  if (lower.includes("fleer")) return "Fleer";
  if (lower.includes("score")) return "Score";
  return undefined;
}

function deriveCardStock(setName?: string | null): "paper" | "chromium" | "unknown" {
  const normalized = (setName ?? "").toLowerCase();
  if (!normalized) return "unknown";
  if (CHROMIUM_KEYWORDS.some((keyword) => normalized.includes(keyword))) {
    return "chromium";
  }
  if (PAPER_KEYWORDS.some((keyword) => normalized.includes(keyword))) {
    return "paper";
  }
  return "unknown";
}

function validateParallelAgainstStock(
  setName?: string | null,
  parallel?: string | null,
  cardStock?: "paper" | "chromium" | "unknown"
): { parallel?: string | null; warnings: string[] } {
  if (!parallel) return { parallel, warnings: [] };
  const normalizedParallel = parallel.toLowerCase();
  const chromiumParallel =
    normalizedParallel.includes("prizm") ||
    normalizedParallel.includes("refractor") ||
    normalizedParallel.includes("chrome");

  if (cardStock === "paper" && chromiumParallel) {
    return { parallel: null, warnings: ["parallel_invalid"] };
  }

  return { parallel, warnings: [] };
}

function parseYearRange(years?: string | null, currentYear?: number): { start?: number; end?: number } {
  if (!years) return {};
  const parts = years.split("-").map((part) => part.trim());
  if (parts.length === 0) return {};
  const start = Number(parts[0]);
  const endRaw = parts[1] ?? "";
  const end = endRaw.toLowerCase() === "present"
    ? (currentYear ? currentYear + 1 : undefined)
    : Number(endRaw);
  return {
    start: Number.isFinite(start) ? start : undefined,
    end: Number.isFinite(end) ? end : undefined,
  };
}

function applyCatalogSignals(
  identity: CardIdentity,
  currentYear: number,
  warnings: string[],
  fieldConfidence: Record<string, FieldConfidence>
): void {
  if (!identity.setName) return;
  const normalizedSet = normalizeText(identity.setName);
  const catalogMatch = CARD_SETS.find((entry) => normalizeText(entry.name) === normalizedSet);
  if (!catalogMatch) return;

  if (identity.year) {
    const range = parseYearRange(catalogMatch.years, currentYear);
    if (range.start && identity.year < range.start) {
      warnings.push("catalog_mismatch");
    } else if (range.end && identity.year > range.end) {
      warnings.push("catalog_mismatch");
    }
  }

  if (fieldConfidence.setName === "low") {
    fieldConfidence.setName = "medium";
  }
}

function resolveYear(
  ocr: { year?: number; confidence: FieldConfidence; warning?: string },
  vision: { year?: number | null; confidence: FieldConfidence },
  currentYear: number
): { year?: number; confidence: FieldConfidence; source?: FieldSource; warnings: string[] } {
  const warnings: string[] = [];
  const maxYear = currentYear + 1;
  const normalizedVisionYear =
    vision.year && vision.year >= 1900 && vision.year <= maxYear ? vision.year : undefined;
  if (vision.year && !normalizedVisionYear) {
    warnings.push("year_out_of_range");
  }
  if (ocr.warning) warnings.push(ocr.warning);

  if (ocr.warning === "year_ambiguous" && normalizedVisionYear) {
    if (vision.confidence !== "low") {
      warnings.push("year_ambiguous");
      return { confidence: "low", warnings };
    }
  }

  if (normalizedVisionYear && ocr.year) {
    if (normalizedVisionYear === ocr.year) {
      const confidence = maxConfidence(ocr.confidence, vision.confidence);
      const source =
        CONFIDENCE_ORDER.indexOf(ocr.confidence) >= CONFIDENCE_ORDER.indexOf(vision.confidence)
          ? "ocr"
          : "vision";
      return { year: ocr.year, confidence, source, warnings };
    }
    if (ocr.confidence !== "low" || vision.confidence !== "low") {
      warnings.push("year_ambiguous");
      return { confidence: "low", warnings };
    }
  }

  if (ocr.year) {
    if (ocr.confidence === "low") {
      warnings.push("year_needs_confirmation");
      return { confidence: "low", warnings };
    }
    return { year: ocr.year, confidence: ocr.confidence, source: "ocr", warnings };
  }

  if (normalizedVisionYear) {
    if (vision.confidence === "low") {
      warnings.push("year_needs_confirmation");
      return { confidence: "low", warnings };
    }
    return { year: normalizedVisionYear, confidence: vision.confidence, source: "vision", warnings };
  }

  warnings.push("year_needs_confirmation");
  return { confidence: "low", warnings };
}

function computeOverallConfidence(fieldConfidence: Record<string, FieldConfidence>): FieldConfidence {
  const keyFields = ["player", "year", "setName", "brand"];
  const values = keyFields
    .map((key) => fieldConfidence[key])
    .filter(Boolean) as FieldConfidence[];
  if (values.includes("low")) return "low";
  if (values.includes("medium")) return "medium";
  return "high";
}

function normalizeValue(value?: string | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function buildOcrSignals(lines: { text: string }[]): OcrSignals {
  const rawText = lines.map((line) => line.text).join("\n");
  const yearCandidates = parseYearCandidates(rawText);
  const brand = extractKeywordMatch(rawText, BRAND_KEYWORDS);
  const setName = extractKeywordMatch(rawText, SET_KEYWORDS) ?? extractKeywordMatch(rawText, INSERT_KEYWORDS);
  const playerExtraction = extractPlayerFromOcr(rawText);
  return {
    lines,
    rawText,
    yearCandidates,
    brand,
    setName,
    player: playerExtraction.player,
    playerCandidates: playerExtraction.candidates,
    playerConfidence: playerExtraction.confidence,
  };
}

export function buildCardIdentityFromSignals(
  ocr: OcrSignals,
  vision: VisionSignals,
  currentYear = new Date().getFullYear()
): CardIdentity {
  const warnings: string[] = [];
  const fieldConfidence: Record<string, FieldConfidence> = {};
  const sources: Record<string, FieldSource> = {};

  const ocrYearSelection = pickTopYearCandidate(ocr.yearCandidates, currentYear);
  const visionYearConfidence = clampConfidence(vision.fieldConfidence?.year ?? vision.fieldsConfidence?.year);
  const resolvedYear = resolveYear(
    {
      year: ocrYearSelection.year,
      confidence: ocrYearSelection.confidence,
      warning: ocrYearSelection.warning,
    },
    {
      year: vision.year,
      confidence: visionYearConfidence,
    },
    currentYear
  );

  warnings.push(...(vision.warnings ?? []).filter(Boolean));
  warnings.push(...resolvedYear.warnings);

  const visionPlayer = normalizeValue(vision.player) ?? normalizeValue(vision.players?.[0] ?? undefined);
  const ocrPlayer = ocr.player;
  const ocrPlayerConfidence = ocr.playerConfidence ?? "low";
  const visionPlayerConfidence = clampConfidence(
    vision.fieldConfidence?.player ?? vision.fieldsConfidence?.player ?? vision.confidence
  );

  let player: string | undefined;
  let playerSource: FieldSource | undefined;
  let playerConfidence: FieldConfidence = "low";

  if (ocrPlayer) {
    if (
      ocrPlayerConfidence === "high" ||
      !visionPlayer ||
      CONFIDENCE_ORDER.indexOf(ocrPlayerConfidence) >= CONFIDENCE_ORDER.indexOf(visionPlayerConfidence)
    ) {
      player = ocrPlayer;
      playerSource = "ocr";
      playerConfidence = ocrPlayerConfidence;
    } else {
      player = visionPlayer;
      playerSource = "vision";
      playerConfidence = visionPlayerConfidence;
    }
  } else if (visionPlayer) {
    player = visionPlayer;
    playerSource = "vision";
    playerConfidence = visionPlayerConfidence;
  }
  const brand = normalizeValue(vision.brand) ?? ocr.brand;
  const setName = normalizeValue(vision.setName) ?? ocr.setName;
  const subset = normalizeValue(vision.subset) ?? normalizeValue(vision.insert) ?? undefined;
  let parallel = normalizeValue(vision.parallel);
  const cardStock = deriveCardStock(setName);
  const parallelValidation = validateParallelAgainstStock(setName, parallel, cardStock);
  parallel = parallelValidation.parallel ?? undefined;
  if (parallelValidation.warnings.length > 0) {
    warnings.push(...parallelValidation.warnings);
  }

  if (player) {
    fieldConfidence.player = playerConfidence;
    if (playerSource) sources.player = playerSource;
  } else {
    fieldConfidence.player = "low";
  }

  const ocrPlayerLocked = Boolean(ocrPlayer && ocrPlayerConfidence === "high");
  if (player && !ocrPlayerLocked && ocr.rawText) {
    const lastName = player.split(/\\s+/).pop()?.toLowerCase();
    const ocrCandidates = ocr.playerCandidates ?? [];
    const matchesPlayer = lastName
      ? ocrCandidates.some((candidate) => candidate.toLowerCase().includes(lastName))
      : false;
    if (ocrCandidates.length > 0 && !matchesPlayer) {
      warnings.push("identity_conflict");
      player = undefined;
      fieldConfidence.player = "low";
      delete sources.player;
    }
  }

  if (brand) {
    if (vision.brand) {
      fieldConfidence.brand = clampConfidence(
        vision.fieldConfidence?.brand ?? vision.fieldsConfidence?.brand ?? vision.confidence
      );
      sources.brand = "vision";
    } else if (ocr.brand) {
      fieldConfidence.brand = "medium";
      sources.brand = "ocr";
    } else {
      fieldConfidence.brand = "low";
      sources.brand = "inferred";
    }
  } else {
    fieldConfidence.brand = "low";
  }

  if (setName) {
    if (vision.setName) {
      fieldConfidence.setName = clampConfidence(
        vision.fieldConfidence?.setName ?? vision.fieldsConfidence?.setName ?? vision.confidence
      );
      sources.setName = "vision";
    } else if (ocr.setName) {
      fieldConfidence.setName = "medium";
      sources.setName = "ocr";
    } else {
      fieldConfidence.setName = "low";
    }
  } else {
    fieldConfidence.setName = "low";
  }

  if (subset) {
    fieldConfidence.subset = clampConfidence(
      vision.fieldConfidence?.subset ?? vision.fieldsConfidence?.subset ?? vision.confidence
    );
    sources.subset = "vision";
  }

  if (parallel) {
    fieldConfidence.parallel = clampConfidence(
      vision.fieldConfidence?.parallel ?? vision.fieldsConfidence?.parallel ?? vision.confidence
    );
    sources.parallel = "vision";
  }

  if (vision.sport) {
    fieldConfidence.sport = clampConfidence(
      vision.fieldConfidence?.sport ?? vision.fieldsConfidence?.sport ?? vision.confidence
    );
    sources.sport = "vision";
  }

  if (vision.league) {
    fieldConfidence.league = clampConfidence(
      vision.fieldConfidence?.league ?? vision.fieldsConfidence?.league ?? vision.confidence
    );
    sources.league = "vision";
  }

  if (vision.cardNumber) {
    fieldConfidence.cardNumber = clampConfidence(
      vision.fieldConfidence?.cardNumber ?? vision.fieldsConfidence?.cardNumber ?? vision.confidence
    );
    sources.cardNumber = "vision";
  }

  if (vision.rookie !== null && vision.rookie !== undefined) {
    fieldConfidence.rookie = clampConfidence(
      vision.fieldConfidence?.rookie ?? vision.fieldsConfidence?.rookie ?? vision.confidence
    );
    sources.rookie = "vision";
  }

  if (resolvedYear.year) {
    fieldConfidence.year = resolvedYear.confidence;
    if (resolvedYear.source) sources.year = resolvedYear.source;
  } else {
    fieldConfidence.year = "low";
  }

  applyCatalogSignals(
    {
      player: player ?? null,
      brand: brand ?? null,
      setName: setName ?? null,
      subset: subset ?? null,
      sport: normalizeValue(vision.sport) ?? null,
      league: normalizeValue(vision.league) ?? null,
      year: resolvedYear.year ?? null,
      cardNumber: normalizeValue(vision.cardNumber) ?? null,
      rookie: vision.rookie ?? null,
      parallel: parallel ?? null,
      cardStock,
      confidence: "low",
      fieldConfidence: {},
      sources: {},
      warnings: [],
      evidenceSummary: null,
    },
    currentYear,
    warnings,
    fieldConfidence
  );

  const confidence = warnings.includes("parse_error")
    ? "low"
    : computeOverallConfidence(fieldConfidence);

  const uniqueWarnings = Array.from(new Set(warnings.filter(Boolean)));

  const evidenceSummary = uniqueWarnings.includes("parse_error")
    ? "Model output could not be parsed. Please confirm details."
    : uniqueWarnings.includes("year_ambiguous")
    ? "Multiple years detected. Please confirm the correct year."
    : uniqueWarnings.includes("year_needs_confirmation")
    ? "Year was not confidently detected."
    : uniqueWarnings.includes("catalog_mismatch")
    ? "Catalog year differs from detected year."
    : uniqueWarnings.length
    ? `Signals: ${uniqueWarnings.join(", ")}`
    : null;

  return {
    player: player ?? null,
    brand: brand ?? null,
    setName: setName ?? null,
    subset: subset ?? null,
    sport: normalizeValue(vision.sport) ?? null,
    league: normalizeValue(vision.league) ?? null,
    year: resolvedYear.year ?? null,
    cardNumber: normalizeValue(vision.cardNumber) ?? null,
    rookie: vision.rookie ?? null,
    parallel: parallel ?? null,
    cardStock,
    confidence,
    fieldConfidence,
    sources,
    warnings: uniqueWarnings,
    evidenceSummary,
  };
}

export const __testing = {
  parseYearCandidates,
  pickTopYearCandidate,
  resolveYear,
  applyCatalogSignals,
  normalizeText,
  extractKeywordMatch,
  inferBrandFromSet,
  clampConfidence,
  minConfidence,
  maxConfidence,
};
