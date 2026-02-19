import crypto from "crypto";
import { buildSearchQuery } from "@/lib/ebay/utils";
import type { MarketQueryInput } from "@/lib/market-discount/types";

function normalize(value: string | undefined | null): string {
  if (!value) return "";
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s#./-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeKeywords(values: string[] | undefined): string[] {
  if (!values || values.length === 0) return [];
  return values
    .map((value) => normalize(value))
    .filter((value) => value.length > 0)
    .sort();
}

export function buildMarketFingerprint(query: MarketQueryInput): string {
  const parts = [
    `player:${normalize(query.player)}`,
    `year:${normalize(query.year)}`,
    `set:${normalize(query.set)}`,
    `grade:${normalize(query.grade)}`,
    `card:${normalize(query.cardNumber)}`,
    `parallel:${normalize(query.parallelType)}`,
    `serial:${normalize(query.serialNumber)}`,
    `variation:${normalize(query.variation)}`,
    `auto:${normalize(query.autograph)}`,
    `relic:${normalize(query.relic)}`,
    `kw:${normalizeKeywords(query.keywords).join(",")}`,
  ];

  const canonical = parts.join("|");
  const hash = crypto.createHash("sha1").update(canonical).digest("hex").slice(0, 16);
  return `${canonical}|h:${hash}`;
}

export function buildQueryText(query: MarketQueryInput): string {
  return buildSearchQuery({
    player: query.player,
    year: query.year,
    set: query.set,
    grade: query.grade,
    cardNumber: query.cardNumber,
    parallelType: query.parallelType,
    serialNumber: query.serialNumber,
    variation: query.variation,
    autograph: query.autograph,
    relic: query.relic,
    keywords: query.keywords,
    limit: query.limit,
  });
}
