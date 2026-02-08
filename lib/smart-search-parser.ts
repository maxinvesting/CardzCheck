import type { ParsedSearch } from "@/types";
import {
  POPULAR_PLAYERS,
  CARD_SETS,
  GRADING_OPTIONS,
  CARD_VARIANTS,
} from "./card-data";
import { normalizeText } from "@/lib/smartSearch/normalize";

// Normalize a string for matching (lowercase, trim, remove extra spaces)
function normalize(str: string): string {
  return normalizeText(str);
}

// Tokenize a query into individual words
function tokenize(query: string): string[] {
  return normalize(query)
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

// Match a year (4-digit number between 1900-2099)
function matchYear(tokens: string[]): { year?: string; remaining: string[] } {
  const yearPattern = /^(19|20)\d{2}$/;
  const remaining: string[] = [];
  let year: string | undefined;

  for (const token of tokens) {
    if (!year && yearPattern.test(token)) {
      year = token;
    } else {
      remaining.push(token);
    }
  }

  return { year, remaining };
}

// Match a serial number (e.g., "/99", "23/99", "1/1")
function matchSerialNumber(tokens: string[]): {
  serial_number?: string;
  remaining: string[];
} {
  const remaining: string[] = [];
  let serial_number: string | undefined;

  // Keep this conservative: only obvious slash formats
  const serialPattern = /^(?:\/\d{1,4}|\d{1,4}\/\d{1,4})$/;

  for (const token of tokens) {
    if (!serial_number && serialPattern.test(token)) {
      // Normalize common "1/1" casing/formatting
      serial_number = token;
    } else {
      remaining.push(token);
    }
  }

  return { serial_number, remaining };
}

// Match a grade (PSA/BGS/SGC/CGC + number)
function matchGrade(tokens: string[]): {
  grade?: string;
  remaining: string[];
} {
  const gradeCompanies = ["psa", "bgs", "sgc", "cgc"];
  const remaining: string[] = [];
  let grade: string | undefined;

  // Pattern 1: "PSA10" or "PSA 10" (combined)
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    // Check for combined format like "psa10"
    for (const company of gradeCompanies) {
      const combinedPattern = new RegExp(`^${company}(\\d+\\.?\\d*)$`, "i");
      const match = token.match(combinedPattern);
      if (match && !grade) {
        grade = `${company.toUpperCase()} ${match[1]}`;
        continue;
      }
    }

    // Check for separate format like "psa" followed by "10"
    if (gradeCompanies.includes(token.toLowerCase()) && !grade) {
      const nextToken = tokens[i + 1];
      if (nextToken && /^\d+\.?\d*$/.test(nextToken)) {
        grade = `${token.toUpperCase()} ${nextToken}`;
        i++; // Skip next token
        continue;
      }
    }

    if (!grade || !token.match(/^(psa|bgs|sgc|cgc|\d+\.?\d*)$/i)) {
      remaining.push(token);
    }
  }

  // Validate grade against known options
  if (grade) {
    const knownGrade = GRADING_OPTIONS.find(
      (g) => normalize(g.value) === normalize(grade!)
    );
    if (!knownGrade) {
      // Try to find closest match
      const gradeNum = grade.match(/\d+\.?\d*/)?.[0];
      const gradeCompany = grade.match(/^[a-zA-Z]+/)?.[0];
      if (gradeNum && gradeCompany) {
        const matchingGrade = GRADING_OPTIONS.find(
          (g) =>
            g.value.toLowerCase().startsWith(gradeCompany.toLowerCase()) &&
            g.value.includes(gradeNum)
        );
        if (matchingGrade) {
          grade = matchingGrade.value;
        }
      }
    }
  }

  return { grade, remaining };
}

// Match a card number (e.g., "#100", "RC-1", "SP-1", "No. 25")
function matchCardNumber(tokens: string[]): {
  card_number?: string;
  remaining: string[];
} {
  const remaining: string[] = [];
  let card_number: string | undefined;

  const isLikelyCardNumberToken = (t: string): boolean => {
    const token = t.replace(/^no\./i, "no").trim();
    if (token.startsWith("#")) return token.length > 1;
    // Be conservative: only common card-number shapes to avoid stealing player/set tokens.
    // Examples:
    // - "RC-1", "SP-10"
    // - "RC1", "SP1", "SSP1"
    if (/^(rc|sp|ssp)-\d{1,4}[a-z]{0,2}$/i.test(token)) return true;
    if (/^(rc|sp|ssp)\d{1,4}[a-z]{0,2}$/i.test(token)) return true;
    if (/^[a-z]{1,6}-\d{1,4}[a-z]{0,2}$/i.test(token)) {
      // Avoid capturing grading shorthand like "PSA10" (handled earlier)
      if (/^(psa|bgs|sgc|cgc)\d+/i.test(token)) return false;
      return true;
    }
    return false;
  };

  // Handle cases like "# 100" or "no. 25"
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const lower = token.toLowerCase();

    if (card_number) {
      remaining.push(token);
      continue;
    }

    if (token === "#" && tokens[i + 1] && /\d{1,4}[a-z]{0,2}$/i.test(tokens[i + 1])) {
      card_number = `#${tokens[i + 1]}`;
      i++; // skip next
      continue;
    }

    if ((lower === "no" || lower === "no." || lower === "number" || lower === "card") && tokens[i + 1]) {
      const next = tokens[i + 1];
      if (isLikelyCardNumberToken(next) || /^\d{1,4}[a-z]{0,2}$/i.test(next)) {
        card_number = next.startsWith("#") ? next : `#${next}`;
        i++; // skip next
        continue;
      }
    }

    if (isLikelyCardNumberToken(token)) {
      card_number = token.startsWith("#") ? token : `#${token}`;
      continue;
    }

    remaining.push(token);
  }

  return { card_number, remaining };
}

// Match variation / SP / SSP / RC (kept simple & conservative)
function matchVariation(tokens: string[]): { variation?: string; remaining: string[] } {
  const remaining: string[] = [];
  let variation: string | undefined;

  // Phrase matches first (e.g., "photo variation", "short print")
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i].toLowerCase();
    const next = tokens[i + 1]?.toLowerCase();

    if (!variation && t === "photo" && next === "variation") {
      variation = "Photo Variation";
      i++;
      continue;
    }
    if (!variation && t === "image" && next === "variation") {
      variation = "Image Variation";
      i++;
      continue;
    }
    if (!variation && t === "short" && next === "print") {
      variation = "Short Print";
      i++;
      continue;
    }

    // Single-token matches
    if (!variation && (t === "ssp" || t === "sp")) {
      variation = t.toUpperCase();
      continue;
    }
    if (!variation && (t === "variation" || t === "variant")) {
      variation = "Variation";
      continue;
    }
    if (!variation && (t === "rc" || t === "rookie" || t === "rookiecard" || (t === "rookie" && next === "card"))) {
      variation = "Rookie Card";
      if (t === "rookie" && next === "card") i++;
      continue;
    }

    remaining.push(tokens[i]);
  }

  return { variation, remaining };
}

function matchAutograph(tokens: string[]): { autograph?: string; remaining: string[] } {
  const remaining: string[] = [];
  let autograph: string | undefined;

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i].toLowerCase();
    const next = tokens[i + 1]?.toLowerCase();

    // "on card auto" / "on card autograph"
    if (
      !autograph &&
      t === "on" &&
      next === "card" &&
      (tokens[i + 2]?.toLowerCase() === "auto" ||
        tokens[i + 2]?.toLowerCase() === "autograph")
    ) {
      autograph = "On-card Autograph";
      i += 2;
      continue;
    }

    if (!autograph && (t === "auto" || t === "autograph" || t === "signed")) {
      autograph = t === "signed" ? "Signed" : "Autograph";

      // Look for "on card" / "on-card"
      if (next === "on-card" || next === "oncard") {
        autograph = "On-card Autograph";
        i++;
      } else if (next === "on" && tokens[i + 2]?.toLowerCase() === "card") {
        autograph = "On-card Autograph";
        i += 2;
      } else if (next === "sticker") {
        autograph = "Sticker Autograph";
        i++;
      }
      continue;
    }

    // Handle "on-card auto" / "sticker auto"
    if (!autograph && (t === "on-card" || t === "oncard") && next === "auto") {
      autograph = "On-card Autograph";
      i++;
      continue;
    }
    if (!autograph && t === "sticker" && next === "auto") {
      autograph = "Sticker Autograph";
      i++;
      continue;
    }

    remaining.push(tokens[i]);
  }

  return { autograph, remaining };
}

function matchRelic(tokens: string[]): { relic?: string; remaining: string[] } {
  const remaining: string[] = [];
  let relic: string | undefined;

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i].toLowerCase();
    const next = tokens[i + 1]?.toLowerCase();

    // "game used"
    if (!relic && t === "game" && next === "used") {
      relic = "Game-used";
      i++;
      continue;
    }
    // "player worn"
    if (!relic && t === "player" && next === "worn") {
      relic = "Player-worn";
      i++;
      continue;
    }

    if (!relic && (t === "relic" || t === "memorabilia" || t === "mem")) {
      relic = "Relic";
      continue;
    }
    if (!relic && t === "patch") {
      relic = next === "auto" ? "Auto Patch" : "Patch";
      if (next === "auto") i++;
      continue;
    }
    if (!relic && t === "jersey") {
      relic = "Jersey";
      continue;
    }
    if (!relic && t === "game-used") {
      relic = "Game-used";
      continue;
    }
    if (!relic && t === "player-worn") {
      relic = "Player-worn";
      continue;
    }

    remaining.push(tokens[i]);
  }

  return { relic, remaining };
}

// Match a player name against known players, or use remaining tokens as player name
function matchPlayer(tokens: string[]): {
  player: string;
  remaining: string[];
  confidence: "high" | "medium" | "low";
} {
  if (tokens.length === 0) {
    return { player: "", remaining: [], confidence: "low" };
  }

  const queryLower = tokens.join(" ");
  let bestMatch: (typeof POPULAR_PLAYERS)[0] | undefined;
  let bestScore = 0;
  let matchedTokens: string[] = [];

  for (const player of POPULAR_PLAYERS) {
    const playerLower = normalize(player.name);
    const playerParts = playerLower.split(" ");

    // Exact match
    if (queryLower.includes(playerLower)) {
      return {
        player: player.name,
        remaining: tokens.filter(
          (t) => !playerLower.includes(t.toLowerCase())
        ),
        confidence: "high",
      };
    }

    // Partial match - check how many name parts match
    let score = 0;
    const matched: string[] = [];
    for (const part of playerParts) {
      if (tokens.some((t) => t.toLowerCase() === part)) {
        score++;
        matched.push(part);
      }
    }

    // Last name match is worth more
    if (
      playerParts.length > 1 &&
      tokens.some(
        (t) => t.toLowerCase() === playerParts[playerParts.length - 1]
      )
    ) {
      score += 0.5;
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = player;
      matchedTokens = matched;
    }
  }

  // If we found a known player match, use it
  if (bestMatch && bestScore >= 1) {
    const remaining = tokens.filter(
      (t) => !matchedTokens.includes(t.toLowerCase())
    );
    return {
      player: bestMatch.name,
      remaining,
      confidence: bestScore >= 2 ? "high" : "medium",
    };
  }

  // No known player found - use all remaining tokens as the player name
  // This allows searching for any player like "Bo Nix", "Jayden Daniels", etc.
  const playerName = tokens.join(" ");

  // Capitalize each word for nicer display
  const formattedName = playerName
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");

  return {
    player: formattedName,
    remaining: [],
    confidence: "medium", // Medium confidence since we're guessing it's a player name
  };
}

// Match a card set against known sets
function matchSet(tokens: string[]): { set?: string; remaining: string[] } {
  const queryLower = tokens.join(" ");

  for (const cardSet of CARD_SETS) {
    const setLower = normalize(cardSet.name);
    const setParts = setLower.split(" ");

    // Check if all set parts are in the query
    const allPartsMatch = setParts.every((part) =>
      tokens.some((t) => t.toLowerCase() === part)
    );

    if (allPartsMatch) {
      const remaining = tokens.filter(
        (t) => !setParts.includes(t.toLowerCase())
      );
      return { set: cardSet.name, remaining };
    }

    // Partial match for single-word sets like "Fleer", "Prizm"
    if (setParts.length === 1 || setParts.some((p) => p.length > 4)) {
      for (const part of setParts) {
        if (
          part.length > 3 &&
          tokens.some((t) => t.toLowerCase() === part.toLowerCase())
        ) {
          const remaining = tokens.filter(
            (t) => t.toLowerCase() !== part.toLowerCase()
          );
          return { set: cardSet.name, remaining };
        }
      }
    }
  }

  return { remaining: tokens };
}

// Match parallel/variant types
function matchParallel(tokens: string[]): {
  parallel?: string;
  remaining: string[];
} {
  const queryLower = tokens.join(" ");

  // Check for known variants
  for (const variant of CARD_VARIANTS) {
    const variantLower = normalize(variant);
    const variantParts = variantLower.split(" ");

    // Multi-word variants
    if (variantParts.length > 1) {
      const allPartsMatch = variantParts.every((part) =>
        tokens.some((t) => t.toLowerCase() === part)
      );
      if (allPartsMatch) {
        const remaining = tokens.filter(
          (t) => !variantParts.includes(t.toLowerCase())
        );
        return { parallel: variant, remaining };
      }
    } else {
      // Single word variants
      const match = tokens.find((t) => t.toLowerCase() === variantLower);
      if (match) {
        const remaining = tokens.filter((t) => t.toLowerCase() !== variantLower);
        return { parallel: variant, remaining };
      }
    }
  }

  // Check for common abbreviations
  const abbreviations: Record<string, string> = {
    // keep this focused on "parallel-ish" things, not ownership metadata
  };

  for (const [abbrev, full] of Object.entries(abbreviations)) {
    if (tokens.some((t) => t.toLowerCase() === abbrev)) {
      const remaining = tokens.filter((t) => t.toLowerCase() !== abbrev);
      return { parallel: full, remaining };
    }
  }

  return { remaining: tokens };
}

// Main parsing function
export function parseSmartSearch(query: string): ParsedSearch {
  if (!query.trim()) {
    return {
      player_name: "",
      confidence: "low",
      unparsed_tokens: [],
    };
  }

  let tokens = tokenize(query);
  let confidence: "high" | "medium" | "low" = "low";

  // Extract year
  const yearResult = matchYear(tokens);
  tokens = yearResult.remaining;

  // Extract grade
  const gradeResult = matchGrade(tokens);
  tokens = gradeResult.remaining;

  // Extract serial number (e.g., /99, 23/99)
  const serialResult = matchSerialNumber(tokens);
  tokens = serialResult.remaining;

  // Extract card number (#100, RC-1, etc.)
  const cardNumberResult = matchCardNumber(tokens);
  tokens = cardNumberResult.remaining;

  // Extract autograph / relic / variation
  const autographResult = matchAutograph(tokens);
  tokens = autographResult.remaining;

  const relicResult = matchRelic(tokens);
  tokens = relicResult.remaining;

  const variationResult = matchVariation(tokens);
  tokens = variationResult.remaining;

  // Extract parallel/variant
  const parallelResult = matchParallel(tokens);
  tokens = parallelResult.remaining;

  // Extract set
  const setResult = matchSet(tokens);
  tokens = setResult.remaining;

  // Extract player (do this last as it's the most flexible match)
  const playerResult = matchPlayer(tokens);
  tokens = playerResult.remaining;
  confidence = playerResult.confidence;

  // If we found a player, boost confidence
  if (playerResult.player && (yearResult.year || setResult.set)) {
    confidence = "high";
  } else if (playerResult.player) {
    confidence = playerResult.confidence;
  }

  return {
    player_name: playerResult.player || tokens.join(" "),
    year: yearResult.year,
    set_name: setResult.set,
    grade: gradeResult.grade,
    card_number: cardNumberResult.card_number,
    parallel_type: parallelResult.parallel,
    serial_number: serialResult.serial_number,
    variation: variationResult.variation,
    autograph: autographResult.autograph,
    relic: relicResult.relic,
    confidence,
    unparsed_tokens: tokens,
  };
}

// Convert ParsedSearch to SearchFormData format
export function parsedSearchToFormData(
  parsed: ParsedSearch
): import("@/types").SearchFormData {
  return {
    player_name: parsed.player_name,
    year: parsed.year,
    set_name: parsed.set_name,
    grade: parsed.grade,
    card_number: parsed.card_number,
    parallel_type: parsed.parallel_type,
    serial_number: parsed.serial_number,
    variation: parsed.variation,
    autograph: parsed.autograph,
    relic: parsed.relic,
  };
}
