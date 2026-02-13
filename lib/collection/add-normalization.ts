import {
  normalizeHttpsImageUrl,
  pickFirstHttpsImageUrl,
} from "@/lib/collection/image-url";
type UnknownRecord = Record<string, unknown>;

export interface NormalizedCollectionAddInput {
  player_name: string | null;
  players: string[] | null;
  year: string | null;
  set_name: string | null;
  insert: string | null;
  parallel_type: string | null;
  card_number: number | null;
  grade: string | null;
  purchase_price: number | null;
  purchase_date: string | null;
  image_url: string | null;
  thumbnail_url: string | null;
  image_urls: string[];
  notes: string | null;
  estimated_cmv: number | null;
  est_cmv: number | null;
}

export interface CollectionInsertPayload
  extends Record<string, string | number | null> {
  user_id: string;
  player_name: string;
}

export const OPTIONAL_COLLECTION_INSERT_COLUMNS = new Set<string>([
  "year",
  "set_name",
  "parallel_type",
  "card_number",
  "grade",
  "purchase_price",
  "purchase_date",
  "image_url",
  "thumbnail_url",
  "notes",
  "est_cmv",
  "estimated_cmv",
  "cmv_confidence",
  "cmv_last_updated",
  "cmv_status",
  "cmv_value",
  "cmv_error",
  "cmv_updated_at",
]);

const toRecord = (value: unknown): UnknownRecord =>
  typeof value === "object" && value !== null ? (value as UnknownRecord) : {};

const coerceTrimmedString = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const coercePositiveNumber = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? value : null;
  }
  if (typeof value === "string") {
    const cleaned = value.replace(/[$,]/g, "").trim();
    if (!cleaned) return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
};

const coerceNullableNumber = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    const cleaned = value.replace(/[$,]/g, "").trim();
    if (!cleaned) return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const coerceOptionalInteger = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
  }
  if (typeof value === "string") {
    const cleaned = value.trim().replace(/^#/, "");
    if (!cleaned) return null;
    if (!/^\d+$/.test(cleaned)) return null;
    const parsed = Number(cleaned);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }
  return null;
};

const coerceStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => entry.length > 0);
};

const coerceHttpsImageUrl = (value: unknown): string | null =>
  normalizeHttpsImageUrl(
    typeof value === "string" ? value.trim() : value
  );

const coerceHttpsImageUrls = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  const normalizedUrls = value
    .map((entry) =>
      normalizeHttpsImageUrl(typeof entry === "string" ? entry.trim() : entry)
    )
    .filter((entry): entry is string => Boolean(entry));

  return [...new Set(normalizedUrls)];
};

export const normalizeCollectionAddInput = (
  value: unknown
): NormalizedCollectionAddInput => {
  const body = toRecord(value);
  const players = coerceStringArray(body.players);
  const notes = coerceTrimmedString(body.notes);
  const insert = coerceTrimmedString(body.insert);

  const notesParts: string[] = [];
  if (notes) notesParts.push(notes);
  if (insert) notesParts.push(`[INSERT:${insert}]`);
  if (players.length > 1) {
    notesParts.push(`[PLAYERS:${JSON.stringify(players)}]`);
  }

  return {
    player_name:
      coerceTrimmedString(body.player_name) ??
      coerceTrimmedString(body.playerName) ??
      coerceTrimmedString(body.player) ??
      coerceTrimmedString(body.name),
    players: players.length > 0 ? players : null,
    year: coerceTrimmedString(body.year),
    set_name:
      coerceTrimmedString(body.set_name) ?? coerceTrimmedString(body.setName),
    insert,
    parallel_type:
      coerceTrimmedString(body.parallel_type) ??
      coerceTrimmedString(body.parallelType),
    card_number:
      coerceOptionalInteger(body.card_number) ??
      coerceOptionalInteger(body.cardNumber),
    grade:
      coerceTrimmedString(body.grade) ?? coerceTrimmedString(body.condition),
    purchase_price:
      coerceNullableNumber(body.purchase_price) ??
      coerceNullableNumber(body.purchasePrice),
    purchase_date:
      coerceTrimmedString(body.purchase_date) ??
      coerceTrimmedString(body.purchaseDate),
    image_url:
      coerceHttpsImageUrl(body.image_url) ?? coerceHttpsImageUrl(body.imageUrl),
    thumbnail_url:
      coerceHttpsImageUrl(body.thumbnail_url) ??
      coerceHttpsImageUrl(body.thumbnailUrl),
    image_urls: coerceHttpsImageUrls(body.image_urls ?? body.imageUrls),
    notes: notesParts.length > 0 ? notesParts.join(" | ") : null,
    estimated_cmv:
      coercePositiveNumber(body.estimated_cmv) ??
      coercePositiveNumber(body.estimatedCmv),
    est_cmv:
      coercePositiveNumber(body.est_cmv) ??
      coercePositiveNumber(body.estCmv),
  };
};

export const validateCollectionAddInput = (
  input: NormalizedCollectionAddInput
): string | null => {
  if (!input.player_name) {
    return "Player name is required";
  }
  return null;
};

export const buildCollectionInsertPayload = (
  userId: string,
  input: NormalizedCollectionAddInput,
  nowIso = new Date().toISOString()
): CollectionInsertPayload => {
  if (!input.player_name) {
    throw new Error("Player name is required");
  }

  const incomingCmv = input.estimated_cmv ?? input.est_cmv;
  const thumbnailUrl = pickFirstHttpsImageUrl([
    input.thumbnail_url,
    input.image_url,
    ...input.image_urls,
  ]);

  return {
    user_id: userId,
    player_name: input.player_name,
    year: input.year,
    set_name: input.set_name,
    parallel_type: input.parallel_type,
    card_number: input.card_number,
    grade: input.grade,
    purchase_price: input.purchase_price,
    purchase_date: input.purchase_date,
    image_url: input.image_url,
    thumbnail_url: thumbnailUrl,
    notes: input.notes,
    ...(incomingCmv !== null
      ? {
          est_cmv: incomingCmv,
          estimated_cmv: incomingCmv,
          cmv_confidence: "medium",
          cmv_last_updated: nowIso,
          cmv_status: "ready",
          cmv_value: incomingCmv,
          cmv_error: null,
          cmv_updated_at: nowIso,
        }
      : {
          cmv_confidence: "unavailable",
          cmv_last_updated: nowIso,
          cmv_status: "pending",
          cmv_value: null,
          cmv_error: null,
          cmv_updated_at: nowIso,
        }),
  };
};

export const extractMissingColumnFromPostgrestMessage = (
  message?: string | null
): string | null => {
  if (!message) return null;
  const missingColumnMatch = message.match(/Could not find the '([^']+)' column/);
  return missingColumnMatch?.[1] ?? null;
};
