export type VoiceSalesChannel =
  | "ebay"
  | "whatnot"
  | "instagram"
  | "show"
  | "local"
  | "other"
  | "veriswap";

export type InventoryVoiceCommand =
  | {
      type: "mark_sold";
      transcript: string;
      salePriceCents: number | null;
      channel: VoiceSalesChannel | null;
      soldAt: string | null;
    }
  | { type: "delete_card"; transcript: string }
  | { type: "confirm"; transcript: string }
  | { type: "cancel"; transcript: string }
  | { type: "unknown"; transcript: string };

interface ParseOptions {
  referenceDate?: Date;
}

const NUMBER_WORDS: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fourty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

const MONTHS: Record<string, number> = {
  january: 0,
  jan: 0,
  february: 1,
  feb: 1,
  march: 2,
  mar: 2,
  april: 3,
  apr: 3,
  may: 4,
  june: 5,
  jun: 5,
  july: 6,
  jul: 6,
  august: 7,
  aug: 7,
  september: 8,
  sept: 8,
  sep: 8,
  october: 9,
  oct: 9,
  november: 10,
  nov: 10,
  december: 11,
  dec: 11,
};

function normalizeTranscript(transcript: string): string {
  return transcript
    .toLowerCase()
    .replace(/[,\u2019']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function formatDateOnly(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function parseNumberWords(value: string): number | null {
  const tokens = value
    .toLowerCase()
    .replace(/-/g, " ")
    .split(/\s+/)
    .filter((token) => token && token !== "and");

  if (tokens.length === 0) return null;

  let total = 0;
  let current = 0;
  let foundNumber = false;

  for (const token of tokens) {
    if (token in NUMBER_WORDS) {
      current += NUMBER_WORDS[token];
      foundNumber = true;
      continue;
    }
    if (token === "hundred") {
      if (current === 0) current = 1;
      current *= 100;
      foundNumber = true;
      continue;
    }
    if (token === "thousand") {
      if (current === 0) current = 1;
      total += current * 1000;
      current = 0;
      foundNumber = true;
      continue;
    }
    return null;
  }

  if (!foundNumber) return null;
  return total + current;
}

function dollarsToCents(value: number): number | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100);
}

export function parseVoiceSalePrice(transcript: string): number | null {
  const normalized = normalizeTranscript(transcript).replace(/\b(\d+),(\d{3})\b/g, "$1$2");
  const numericPatterns = [
    /\$\s*(\d+(?:\.\d{1,2})?)/i,
    /\b(?:sold\s+for|for|at|price(?:d)?(?:\s+at)?|sale\s+price(?:\s+is)?)\s+\$?\s*(\d+(?:\.\d{1,2})?)\b/i,
    /\b(\d+(?:\.\d{1,2})?)\s*(?:dollars?|bucks|usd)\b/i,
  ];

  for (const pattern of numericPatterns) {
    const match = normalized.match(pattern);
    if (!match?.[1]) continue;
    const cents = dollarsToCents(Number.parseFloat(match[1]));
    if (cents != null) return cents;
  }

  const wordMatch = normalized.match(
    /\b((?:(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fourty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|and)[-\s]*)+)\s+(?:dollars?|bucks)\b/i
  );
  if (!wordMatch?.[1]) return null;

  const dollars = parseNumberWords(wordMatch[1]);
  return dollars != null ? dollarsToCents(dollars) : null;
}

export function parseVoiceSalesChannel(transcript: string): VoiceSalesChannel | null {
  const normalized = normalizeTranscript(transcript);
  if (/\bebay\b|e bay/.test(normalized)) return "ebay";
  if (/\bwhatnot\b|what not/.test(normalized)) return "whatnot";
  if (/\binstagram\b|\big\b/.test(normalized)) return "instagram";
  if (/\b(card\s+)?show\b/.test(normalized)) return "show";
  if (/\blocal\b|\bin person\b|\bcash\b/.test(normalized)) return "local";
  if (/\bveriswap\b/.test(normalized)) return "veriswap";
  if (/\bother\b/.test(normalized)) return "other";
  return null;
}

export function parseVoiceSoldDate(
  transcript: string,
  options: ParseOptions = {}
): string | null {
  const normalized = normalizeTranscript(transcript);
  const referenceDate = options.referenceDate ?? new Date();

  if (/\btoday\b/.test(normalized)) return formatDateOnly(referenceDate);
  if (/\byesterday\b/.test(normalized)) return formatDateOnly(addDays(referenceDate, -1));

  const isoMatch = normalized.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${pad2(month)}-${pad2(day)}`;
    }
  }

  const monthMatch = normalized.match(
    /\b(?:on\s+)?(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s+(20\d{2}))?\b/
  );
  if (monthMatch?.[1] && monthMatch[2]) {
    const month = MONTHS[monthMatch[1]];
    const day = Number(monthMatch[2]);
    const year = monthMatch[3] ? Number(monthMatch[3]) : referenceDate.getFullYear();
    if (month != null && day >= 1 && day <= 31) {
      return `${year}-${pad2(month + 1)}-${pad2(day)}`;
    }
  }

  return null;
}

export function parseInventoryVoiceCommand(
  transcript: string,
  options: ParseOptions = {}
): InventoryVoiceCommand {
  const trimmed = transcript.trim();
  const normalized = normalizeTranscript(trimmed);

  if (!normalized) return { type: "unknown", transcript: trimmed };

  if (
    /^(confirm|yes|yep|do it|confirm delete|yes delete|confirmed)$/.test(normalized) ||
    /\bconfirm\s+delete\b/.test(normalized)
  ) {
    return { type: "confirm", transcript: trimmed };
  }

  if (/^(cancel|stop|never mind|nevermind|abort|no)$/.test(normalized)) {
    return { type: "cancel", transcript: trimmed };
  }

  if (/\b(delete|remove)\b/.test(normalized) && /\b(card|item|this|it)\b/.test(normalized)) {
    return { type: "delete_card", transcript: trimmed };
  }

  const looksLikeSaleCommand =
    /\b(mark|record|log|set)\b.*\b(sold|sale)\b/.test(normalized) ||
    /\b(mark\s+sold|sold\s+this|sold\s+it|card\s+sold|item\s+sold)\b/.test(normalized) ||
    /\bsold\b.*(?:\$|\bfor\b|\bat\b|\bdollars?\b|\bbucks\b|\bebay\b|\bwhatnot\b|\blocal\b)/.test(
      normalized
    );

  if (looksLikeSaleCommand) {
    return {
      type: "mark_sold",
      transcript: trimmed,
      salePriceCents: parseVoiceSalePrice(trimmed),
      channel: parseVoiceSalesChannel(trimmed),
      soldAt: parseVoiceSoldDate(trimmed, options),
    };
  }

  return { type: "unknown", transcript: trimmed };
}

export function centsToVoiceInputValue(cents: number | null): string {
  if (cents == null) return "";
  return (cents / 100).toFixed(2);
}
