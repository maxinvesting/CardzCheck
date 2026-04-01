import { computeSkuId, type SkuFingerprintInput } from "./sku";

export const listingStatuses = ["active", "paused"] as const;

export type ListingStatus = (typeof listingStatuses)[number];

export type ListingFingerprint = SkuFingerprintInput;

export type ListingEditorPayload = {
  skuId?: string;
  name: string;
  imageUrl?: string | null;
  notes?: string | null;
  status?: string | null;
  year: string;
  set: string;
  player: string;
  cardNo?: string | null;
  parallel?: string | null;
  grade: string;
};

export type NormalizedListingInput = {
  skuId: `0x${string}`;
  name: string;
  imageUrl: string | null;
  notes: string | null;
  status: ListingStatus;
  fingerprint: ListingFingerprint;
  details: Record<string, string>;
};

export function isBytes32(value: string): value is `0x${string}` {
  return /^0x[0-9a-fA-F]{64}$/.test(value);
}

function normalizeText(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

export function buildListingFingerprint(payload: ListingEditorPayload): ListingFingerprint {
  return {
    year: normalizeText(payload.year),
    set: normalizeText(payload.set),
    player: normalizeText(payload.player),
    cardNo: normalizeText(payload.cardNo),
    parallel: normalizeText(payload.parallel),
    grade: normalizeText(payload.grade),
  };
}

export function normalizeListingStatus(value: string | null | undefined): ListingStatus {
  return value === "paused" ? "paused" : "active";
}

export function normalizeListingInput(payload: ListingEditorPayload): NormalizedListingInput {
  const fingerprint = buildListingFingerprint(payload);

  if (!fingerprint.year || !fingerprint.set || !fingerprint.player || !fingerprint.grade) {
    throw new Error("Year, set, player, and grade are required");
  }

  const name = normalizeText(payload.name);
  if (!name) {
    throw new Error("Name is required");
  }

  const computedSkuId = computeSkuId(fingerprint);
  const requestedSkuId = normalizeText(payload.skuId).toLowerCase();
  if (requestedSkuId && (!isBytes32(requestedSkuId) || requestedSkuId !== computedSkuId)) {
    throw new Error("skuId does not match the listing fingerprint");
  }

  return {
    skuId: computedSkuId,
    name,
    imageUrl: normalizeText(payload.imageUrl) || null,
    notes: normalizeText(payload.notes) || null,
    status: normalizeListingStatus(payload.status),
    fingerprint,
    details: {
      year: fingerprint.year,
      set: fingerprint.set,
      player: fingerprint.player,
      cardNo: fingerprint.cardNo,
      parallel: fingerprint.parallel,
      grade: fingerprint.grade,
    },
  };
}
