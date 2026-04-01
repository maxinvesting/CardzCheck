export const SHOP_CATEGORY_OPTIONS = [
  "Football",
  "Basketball",
  "Baseball",
  "Hockey",
  "Soccer",
  "Pokemon",
  "One Piece",
  "Other TCG",
  "Other",
] as const;

export type ShopCategoryLabel = (typeof SHOP_CATEGORY_OPTIONS)[number];
export type CardMarketDomain =
  | "sports"
  | "pokemon"
  | "one_piece"
  | "other_tcg"
  | "non_sport";

type InferenceInput = {
  game?: string | null;
  sport?: string | null;
  title?: string | null;
  set?: string | null;
  player?: string | null;
  keywords?: string[] | null;
};

const SHOP_CATEGORY_SET = new Set<ShopCategoryLabel>(SHOP_CATEGORY_OPTIONS);

const EXPLICIT_CATEGORY_ALIASES: Record<string, ShopCategoryLabel> = {
  football: "Football",
  nfl: "Football",
  basketball: "Basketball",
  nba: "Basketball",
  baseball: "Baseball",
  mlb: "Baseball",
  hockey: "Hockey",
  nhl: "Hockey",
  soccer: "Soccer",
  futbol: "Soccer",
  pokemon: "Pokemon",
  pokemoncards: "Pokemon",
  "one piece": "One Piece",
  onepiece: "One Piece",
  "one-piece": "One Piece",
  tcg: "Other TCG",
  ccg: "Other TCG",
  "other tcg": "Other TCG",
  "trading card game": "Other TCG",
  "collectible card game": "Other TCG",
  magic: "Other TCG",
  mtg: "Other TCG",
  yugioh: "Other TCG",
  "yu gi oh": "Other TCG",
  lorcana: "Other TCG",
  digimon: "Other TCG",
  "dragon ball": "Other TCG",
  "non sport": "Other",
  nonsport: "Other",
  other: "Other",
};

const SPORTS_KEYWORDS: Array<{ keyword: string; label: ShopCategoryLabel }> = [
  { keyword: "football", label: "Football" },
  { keyword: "nfl", label: "Football" },
  { keyword: "basketball", label: "Basketball" },
  { keyword: "nba", label: "Basketball" },
  { keyword: "baseball", label: "Baseball" },
  { keyword: "mlb", label: "Baseball" },
  { keyword: "hockey", label: "Hockey" },
  { keyword: "nhl", label: "Hockey" },
  { keyword: "soccer", label: "Soccer" },
  { keyword: "fifa", label: "Soccer" },
  { keyword: "uefa", label: "Soccer" },
];

const POKEMON_KEYWORDS = [
  "pokemon",
  "pok mon",
  "scarlet violet",
  "sword shield",
  "sun moon",
  "paldea",
  "paldean",
  "evolving skies",
  "crown zenith",
  "surging sparks",
  "obsidian flames",
  "pokemon center",
];

const POKEMON_NAME_KEYWORDS = [
  "pikachu",
  "charizard",
  "mewtwo",
  "mew",
  "eevee",
  "umbreon",
  "rayquaza",
  "gengar",
  "greninja",
  "lugia",
  "blastoise",
];

const ONE_PIECE_KEYWORDS = [
  "one piece",
  "romance dawn",
  "paramount war",
  "pillars of strength",
  "kingdoms of intrigue",
  "awakening of the new era",
  "wings of the captain",
  "500 years in the future",
];

const ONE_PIECE_NAME_KEYWORDS = [
  "luffy",
  "zoro",
  "nami",
  "shanks",
  "sanji",
  "trafalgar",
  "boa hancock",
  "sabo",
];

const ONE_PIECE_CODE_REGEX = /\b(?:op|eb|st)[-\s]?\d{2}\b/i;
const POKEMON_CODE_REGEX = /\b(?:sv|sm|xy)[-\s]?\d{1,3}\b/i;

export const EBAY_SPORTS_BROWSE_CATEGORY_ID = "212";
export const EBAY_SPORTS_LISTING_CATEGORY_ID = "261328";
export const EBAY_TCG_CATEGORY_ID = "183454";
export const EBAY_NON_SPORT_CATEGORY_ID = "183050";

function normalizeToken(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeForAliasLookup(value: string): string {
  const normalized = normalizeToken(value);
  if (!normalized) return normalized;
  if (EXPLICIT_CATEGORY_ALIASES[normalized]) return normalized;
  return normalized.replace(/\s+/g, "");
}

function includesAnyKeyword(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}

function detectFromText(text: string): ShopCategoryLabel | null {
  if (!text) return null;

  if (
    ONE_PIECE_CODE_REGEX.test(text) ||
    includesAnyKeyword(text, ONE_PIECE_KEYWORDS) ||
    includesAnyKeyword(text, ONE_PIECE_NAME_KEYWORDS)
  ) {
    return "One Piece";
  }

  if (
    POKEMON_CODE_REGEX.test(text) ||
    includesAnyKeyword(text, POKEMON_KEYWORDS) ||
    includesAnyKeyword(text, POKEMON_NAME_KEYWORDS)
  ) {
    return "Pokemon";
  }

  if (
    text.includes("tcg") ||
    text.includes("ccg") ||
    text.includes("trading card game") ||
    text.includes("collectible card game")
  ) {
    return "Other TCG";
  }

  for (const candidate of SPORTS_KEYWORDS) {
    if (text.includes(candidate.keyword)) {
      return candidate.label;
    }
  }

  return null;
}

export function isShopCategoryLabel(value: unknown): value is ShopCategoryLabel {
  return typeof value === "string" && SHOP_CATEGORY_SET.has(value as ShopCategoryLabel);
}

export function normalizeShopCategoryLabel(value: unknown): ShopCategoryLabel | null {
  if (isShopCategoryLabel(value)) return value;
  if (typeof value !== "string" || !value.trim()) return null;

  const aliasKey = normalizeForAliasLookup(value);
  return EXPLICIT_CATEGORY_ALIASES[aliasKey] ?? null;
}

export function inferShopCategoryLabel(
  input: InferenceInput,
  fallback: ShopCategoryLabel = "Other"
): ShopCategoryLabel {
  const explicit =
    normalizeShopCategoryLabel(input.game) ?? normalizeShopCategoryLabel(input.sport);
  if (explicit) return explicit;

  const text = normalizeToken(
    [
      input.title ?? "",
      input.set ?? "",
      input.player ?? "",
      ...(input.keywords ?? []),
    ]
      .filter(Boolean)
      .join(" ")
  );

  return detectFromText(text) ?? fallback;
}

export function shopCategoryToMarketDomain(
  category: ShopCategoryLabel
): CardMarketDomain {
  if (category === "Pokemon") return "pokemon";
  if (category === "One Piece") return "one_piece";
  if (category === "Other TCG") return "other_tcg";
  if (category === "Other") return "non_sport";
  return "sports";
}

function domainToFallbackCategory(domain: CardMarketDomain): ShopCategoryLabel {
  if (domain === "pokemon") return "Pokemon";
  if (domain === "one_piece") return "One Piece";
  if (domain === "other_tcg") return "Other TCG";
  if (domain === "non_sport") return "Other";
  return "Football";
}

export function inferCardMarketDomain(
  input: InferenceInput,
  fallback: CardMarketDomain = "sports"
): CardMarketDomain {
  const category = inferShopCategoryLabel(input, domainToFallbackCategory(fallback));
  return shopCategoryToMarketDomain(category);
}

export function getEbayBrowseCategoryId(input: InferenceInput): string {
  const domain = inferCardMarketDomain(input, "sports");
  if (domain === "sports") return EBAY_SPORTS_BROWSE_CATEGORY_ID;
  if (domain === "non_sport") return EBAY_NON_SPORT_CATEGORY_ID;
  return EBAY_TCG_CATEGORY_ID;
}

export function getEbayListingCategoryId(input: InferenceInput): string {
  const domain = inferCardMarketDomain(input, "sports");
  if (domain === "sports") return EBAY_SPORTS_LISTING_CATEGORY_ID;
  if (domain === "non_sport") return EBAY_NON_SPORT_CATEGORY_ID;
  return EBAY_TCG_CATEGORY_ID;
}
