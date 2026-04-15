import { parseSmartSearch } from "@/lib/smart-search-parser";
import {
  extractBrandAndLine,
  extractCardNumber,
  extractParallel,
  extractYear,
  tokenize,
} from "@/lib/smartSearch/normalize";
import type { ParsedSearch } from "@/types";

export type ParsedGradingCardTitle = {
  title: string;
  player: string;
  year: string;
  setName: string;
  cardNumber: string;
  parallel: string;
  printRun: string;
  variation: string;
  confidence: ParsedSearch["confidence"];
};

function clean(value?: string | null): string {
  return typeof value === "string" ? value.trim() : "";
}

function buildSetName(title: string, parsed: ParsedSearch): string {
  const directSet = clean(parsed.set_name);
  if (directSet) return directSet;

  const { brand, line } = extractBrandAndLine(title);
  return [brand, line].filter(Boolean).join(" ").trim();
}

function stripDuplicateSetTokens(parallel: string, setName: string): string {
  if (!parallel || !setName) return parallel;
  const setTokens = new Set(tokenize(setName));
  const cleanedTokens = parallel
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => !setTokens.has(tokenize(token)[0] ?? ""));

  return cleanedTokens.join(" ").trim();
}

export function parseGradingCardTitle(title: string): ParsedGradingCardTitle {
  const trimmedTitle = clean(title);
  if (!trimmedTitle) {
    return {
      title: "",
      player: "",
      year: "",
      setName: "",
      cardNumber: "",
      parallel: "",
      printRun: "",
      variation: "",
      confidence: "low",
    };
  }

  const parsed = parseSmartSearch(trimmedTitle);
  const setName = buildSetName(trimmedTitle, parsed);
  const rawParallel = clean(parsed.parallel_type) || clean(extractParallel(trimmedTitle));
  const parallel = stripDuplicateSetTokens(rawParallel, setName);

  return {
    title: trimmedTitle,
    player: clean(parsed.player_name),
    year: clean(parsed.year) || clean(extractYear(trimmedTitle)),
    setName,
    cardNumber: clean(parsed.card_number) || clean(extractCardNumber(trimmedTitle)),
    parallel,
    printRun: clean(parsed.serial_number),
    variation: clean(parsed.variation),
    confidence: parsed.confidence,
  };
}

export function buildParsedCardDetailLine(title: string): string | null {
  const parsed = parseGradingCardTitle(title);
  const parts = [
    parsed.player,
    parsed.year,
    parsed.setName,
    parsed.parallel,
    parsed.printRun,
    parsed.cardNumber,
  ].filter(Boolean);

  return parts.length >= 2 ? parts.join(" · ") : null;
}

export function buildDeclaredScanPrefaceFromTitle(options: {
  cardTitle: string;
  gradingCompany: string;
}): string {
  const parsed = parseGradingCardTitle(options.cardTitle);
  const structuredDetails = [
    parsed.player ? `Player: ${parsed.player}` : "",
    parsed.year ? `Year: ${parsed.year}` : "",
    parsed.setName ? `Set: ${parsed.setName}` : "",
    parsed.parallel ? `Parallel: ${parsed.parallel}` : "",
    parsed.printRun ? `Print run: ${parsed.printRun}` : "",
    parsed.cardNumber ? `Card number: ${parsed.cardNumber}` : "",
    parsed.variation ? `Variation: ${parsed.variation}` : "",
  ].filter(Boolean);

  const lines = [
    parsed.title ? `Declared card title: ${parsed.title}.` : "",
    structuredDetails.length > 0 ? `Parsed details: ${structuredDetails.join("; ")}.` : "",
    `Target grading company: ${options.gradingCompany}.`,
  ].filter(Boolean);

  return `${lines.join(" ")}\n\n`;
}
