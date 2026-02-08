import { parseSmartSearch } from "@/lib/smart-search-parser";
import {
  tokenize,
  extractBrandAndLine,
  extractParallel,
  extractCardNumber,
  extractYear,
  extractGraderAndGrade,
} from "./normalize";
import type { ParsedQuery, LockedConstraints } from "./types";

/**
 * Parse a raw user query into a ParsedQuery:
 *  - Delegates core token identification to the existing parseSmartSearch
 *  - Then derives locked constraints based on explicit tokens in the query
 */
export function parseQuery(rawQuery: string): ParsedQuery {
  const original = parseSmartSearch(rawQuery);
  const tokens = tokenize(rawQuery);

  const locked: LockedConstraints = {};

  // Year lock: if a 4-digit year is explicitly present, lock it
  const yearFromQuery = extractYear(rawQuery);
  if (yearFromQuery) {
    locked.year = yearFromQuery;
  } else if (original.year) {
    // Fallback: if parser found a year but we didn't, still consider it locked
    locked.year = original.year;
  }

  // Brand/line lock: prefer explicit tokens in the raw query; otherwise infer from parsed set_name
  const brandLineFromQuery = extractBrandAndLine(rawQuery);
  if (brandLineFromQuery.brand) locked.brand = brandLineFromQuery.brand;
  if (brandLineFromQuery.line) locked.line = brandLineFromQuery.line;

  if ((!locked.brand || !locked.line) && original.set_name) {
    const fromSet = extractBrandAndLine(original.set_name);
    if (!locked.brand && fromSet.brand) locked.brand = fromSet.brand;
    if (!locked.line && fromSet.line) locked.line = fromSet.line;
  }

  // Player lock: if parser found a non-empty player name, treat it as locked
  if (original.player_name && original.player_name.trim()) {
    locked.player = original.player_name.trim();
  }

  // Card number lock: explicit "#4" / "No. 4" or parsed card_number
  const cardNumberFromQuery = extractCardNumber(rawQuery);
  if (cardNumberFromQuery) {
    locked.cardNumber = cardNumberFromQuery;
  } else if (original.card_number) {
    locked.cardNumber = original.card_number.startsWith("#")
      ? original.card_number
      : `#${original.card_number}`;
  }

  // Parallel lock: explicit parallel keywords in the query or parsed parallel_type
  const parallelFromQuery = extractParallel(rawQuery);
  if (parallelFromQuery) {
    locked.parallel = parallelFromQuery;
  } else if (original.parallel_type) {
    locked.parallel = original.parallel_type;
  }

  // Grader + grade lock (if explicitly present)
  const graderGradeFromQuery = extractGraderAndGrade(rawQuery);
  if (graderGradeFromQuery.grader) {
    locked.grader = graderGradeFromQuery.grader;
  }
  if (graderGradeFromQuery.grade) {
    locked.grade = graderGradeFromQuery.grade;
  } else if (original.grade) {
    const parsedGrade = extractGraderAndGrade(original.grade);
    if (parsedGrade.grader) locked.grader = parsedGrade.grader;
    if (parsedGrade.grade) locked.grade = parsedGrade.grade;
  }

  const variantTokens = [
    original.parallel_type,
    original.variation,
    original.autograph,
    original.relic,
  ]
    .filter(Boolean)
    .flatMap((value) => tokenize(value ?? ""));

  const setName = original.set_name?.trim() || undefined;
  const brandLineFromSet = setName ? extractBrandAndLine(setName) : { brand: undefined, line: undefined };

  return {
    original,
    locked,
    tokens,
    signals: {
      player: original.player_name?.trim() || undefined,
      year: original.year || locked.year,
      brand: locked.brand || brandLineFromSet.brand,
      line: locked.line || brandLineFromSet.line,
      setName,
      variantTokens,
      grader: locked.grader,
      grade: locked.grade,
      cardNumber:
        locked.cardNumber ||
        (original.card_number ? (original.card_number.startsWith("#") ? original.card_number : `#${original.card_number}`) : undefined),
    },
  };
}
