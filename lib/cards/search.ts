import { normalizeCardNumber } from "@/lib/cards/format";

export interface CardSearchFilters {
  playerId: string;
  setSlug: string;
  year?: string;
  parallel?: string;
  grader?: string;
  grade?: string;
  cardNumber?: string;
}

export interface CardCatalogRow {
  id: string;
  year?: string | null;
  brand?: string | null;
  set_name?: string | null;
  player_name?: string | null;
  variant?: string | null;
  grader?: string | null;
  grade?: string | null;
  card_number?: string | null;
}

export interface ScoredCard extends CardCatalogRow {
  matchCount: number;
  textScore: number;
  score: number;
}

export interface ParsedCardSearchPayload {
  filters: CardSearchFilters;
  limit: number;
  relaxOptional: boolean;
}

export type ParseCardSearchResult =
  | { ok: true; value: ParsedCardSearchPayload }
  | { ok: false; error: string; missing: string[] };

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 50;

export function parseCardSearchPayload(payload: unknown): ParseCardSearchResult {
  const body = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const playerId = typeof body.playerId === "string" ? body.playerId.trim() : "";
  const setSlug = typeof body.setSlug === "string" ? body.setSlug.trim() : "";
  const missing: string[] = [];
  if (!playerId) missing.push("playerId");
  if (!setSlug) missing.push("setSlug");

  if (missing.length > 0) {
    return {
      ok: false,
      error: "playerId and setSlug are required",
      missing,
    };
  }

  const limitInput = typeof body.limit === "number" ? body.limit : Number(body.limit);
  const limit = Number.isFinite(limitInput)
    ? Math.min(Math.max(limitInput, 1), MAX_LIMIT)
    : DEFAULT_LIMIT;
  const relaxOptional = Boolean(body.relaxOptional);

  const filters: CardSearchFilters = {
    playerId,
    setSlug,
    year: cleanOptional(body.year),
    parallel: cleanOptional(body.parallel),
    grader: cleanOptional(body.grader),
    grade: cleanOptional(body.grade),
    cardNumber: cleanOptional(body.cardNumber),
  };

  return { ok: true, value: { filters, limit, relaxOptional } };
}

export function hasOptionalFilters(filters: CardSearchFilters): boolean {
  return Boolean(
    filters.year ||
      filters.parallel ||
      filters.grader ||
      filters.grade ||
      filters.cardNumber
  );
}

export function filterByOptionalFilters(
  rows: CardCatalogRow[],
  filters: CardSearchFilters
): CardCatalogRow[] {
  if (!hasOptionalFilters(filters)) return rows;
  return rows.filter((row) => matchesAllOptionalFilters(row, filters));
}

export function rankCards(
  rows: CardCatalogRow[],
  filters: CardSearchFilters,
  limit: number
): ScoredCard[] {
  const scored = rows.map((row) => scoreCard(row, filters));
  scored.sort((a, b) => {
    if (b.matchCount !== a.matchCount) return b.matchCount - a.matchCount;
    if (b.textScore !== a.textScore) return b.textScore - a.textScore;
    return compareYearDesc(a.year, b.year);
  });
  return scored.slice(0, limit);
}

export function runCardSearch(
  rows: CardCatalogRow[],
  filters: CardSearchFilters,
  options?: { relaxOptional?: boolean; limit?: number }
): { results: ScoredCard[]; relaxed: boolean; canRelax: boolean } {
  const relaxOptional = Boolean(options?.relaxOptional);
  const hasOptional = hasOptionalFilters(filters);
  const filtered = !relaxOptional && hasOptional ? filterByOptionalFilters(rows, filters) : rows;
  const limit = options?.limit ?? DEFAULT_LIMIT;
  return {
    results: rankCards(filtered, filters, limit),
    relaxed: relaxOptional,
    canRelax: hasOptional && !relaxOptional,
  };
}

function cleanOptional(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeText(value?: string | null): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeCardNumberValue(value?: string | null): string | undefined {
  return normalizeCardNumber(value ?? undefined);
}

function tokenize(value?: string | null): string[] {
  const normalized = normalizeText(value);
  return normalized.length > 0 ? normalized.split(/\s+/) : [];
}

function matchesAllOptionalFilters(row: CardCatalogRow, filters: CardSearchFilters): boolean {
  if (filters.year && normalizeText(row.year) !== normalizeText(filters.year)) {
    return false;
  }

  if (filters.parallel) {
    const variant = normalizeText(row.variant);
    const desired = normalizeText(filters.parallel);
    if (!variant || !variant.includes(desired)) {
      return false;
    }
  }

  if (filters.grader && normalizeText(row.grader) !== normalizeText(filters.grader)) {
    return false;
  }

  if (filters.grade && normalizeText(row.grade) !== normalizeText(filters.grade)) {
    return false;
  }

  if (filters.cardNumber) {
    const normalizedRow = normalizeCardNumberValue(row.card_number);
    const normalizedFilter = normalizeCardNumberValue(filters.cardNumber);
    if (normalizedRow && normalizedFilter) {
      if (normalizedRow !== normalizedFilter) return false;
    } else {
      return false;
    }
  }

  return true;
}

function countOptionalMatches(row: CardCatalogRow, filters: CardSearchFilters): number {
  let matches = 0;
  if (filters.year && normalizeText(row.year) === normalizeText(filters.year)) matches += 1;
  if (filters.parallel) {
    const variant = normalizeText(row.variant);
    const desired = normalizeText(filters.parallel);
    if (variant && variant.includes(desired)) matches += 1;
  }
  if (filters.grader && normalizeText(row.grader) === normalizeText(filters.grader)) matches += 1;
  if (filters.grade && normalizeText(row.grade) === normalizeText(filters.grade)) matches += 1;
  if (filters.cardNumber) {
    const normalizedRow = normalizeCardNumberValue(row.card_number);
    const normalizedFilter = normalizeCardNumberValue(filters.cardNumber);
    if (normalizedRow && normalizedFilter && normalizedRow === normalizedFilter) {
      matches += 1;
    }
  }
  return matches;
}

function tokenOverlapScore(a: string, b: string): number {
  const tokensA = new Set(tokenize(a));
  const tokensB = new Set(tokenize(b));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let intersection = 0;
  tokensA.forEach((token) => {
    if (tokensB.has(token)) intersection += 1;
  });
  const union = tokensA.size + tokensB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

function scoreCard(row: CardCatalogRow, filters: CardSearchFilters): ScoredCard {
  const matchCount = countOptionalMatches(row, filters);
  const queryText = [
    filters.parallel,
    filters.cardNumber,
    filters.grader,
    filters.grade,
  ]
    .filter(Boolean)
    .join(" ");
  const candidateText = [
    row.variant,
    row.card_number,
    row.grader,
    row.grade,
  ]
    .filter(Boolean)
    .join(" ");
  const textScore = tokenOverlapScore(queryText, candidateText);
  return {
    ...row,
    matchCount,
    textScore,
    score: matchCount + textScore,
  };
}

function compareYearDesc(a?: string | null, b?: string | null): number {
  const aNum = Number(a);
  const bNum = Number(b);
  if (Number.isFinite(aNum) && Number.isFinite(bNum)) {
    return bNum - aNum;
  }
  return String(b ?? "").localeCompare(String(a ?? ""));
}
