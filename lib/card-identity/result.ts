import type { CardIdentity, CardIdentificationResult } from "@/types";

export function emptyCardIdentity(warnings: string[] = []): CardIdentity {
  return {
    player: null,
    year: null,
    brand: null,
    setName: null,
    subset: null,
    sport: null,
    league: null,
    cardNumber: null,
    rookie: null,
    parallel: null,
    cardStock: "unknown",
    confidence: "low",
    fieldConfidence: { year: "low", player: "low" },
    sources: {},
    warnings,
    evidenceSummary: warnings.includes("parse_error")
      ? "Model output could not be parsed. Please confirm details."
      : null,
  };
}

export function normalizeIdentificationResult(
  input: CardIdentificationResult
): CardIdentificationResult {
  let cardIdentity = input.cardIdentity ?? emptyCardIdentity();
  const hasParseError = cardIdentity.warnings.includes("parse_error");
  if (hasParseError) {
    cardIdentity = emptyCardIdentity(["parse_error"]);
  }
  const normalized: CardIdentificationResult = {
    player_name: input.player_name ?? "",
    players: input.players ?? (input.player_name ? [input.player_name] : []),
    year: input.year ?? undefined,
    set_name: input.set_name ?? undefined,
    insert: input.insert ?? undefined,
    grade: input.grade ?? undefined,
    card_number: input.card_number ?? undefined,
    parallel_type: input.parallel_type ?? undefined,
    serial_number: input.serial_number ?? undefined,
    variation: input.variation ?? undefined,
    autograph: input.autograph ?? undefined,
    relic: input.relic ?? undefined,
    imageUrl: input.imageUrl ?? "",
    imageUrls: input.imageUrls ?? undefined,
    confidence: input.confidence ?? "low",
    cardIdentity,
    confirmedYear: input.confirmedYear ?? undefined,
  };

  if (!hasParseError && !normalized.player_name && cardIdentity.player) {
    normalized.player_name = cardIdentity.player;
    normalized.players = [cardIdentity.player];
  }

  if (hasParseError) {
    normalized.player_name = "";
    normalized.players = [];
    normalized.year = undefined;
    normalized.set_name = undefined;
    normalized.parallel_type = undefined;
  }

  return normalized;
}
