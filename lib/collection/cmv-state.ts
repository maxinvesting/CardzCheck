import { getEstCmv, type ValuedCollectionItem } from "@/lib/values";
import type { CollectionItem } from "@/types";

const NEW_CARD_CMV_WINDOW_MS = 120_000;
const CMV_PENDING_STALE_MS = 15_000;

export type CmvUiState =
  | "ready"
  | "pending"
  | "pending_stale"
  | "failed"
  | "unavailable";

const getBaseTimestampMs = (item: Partial<CollectionItem>): number | null => {
  const raw = item.cmv_updated_at ?? item.created_at ?? item.cmv_last_updated;
  if (!raw) return null;
  const ts = new Date(raw).getTime();
  return Number.isFinite(ts) ? ts : null;
};

export const getCollectionCmvUiState = (
  item: Partial<CollectionItem>,
  nowMs = Date.now()
): CmvUiState => {
  const cmv = getEstCmv(item as ValuedCollectionItem);
  if (cmv !== null) {
    return "ready";
  }

  const status = item.cmv_status ?? null;
  const timestampMs = getBaseTimestampMs(item);

  if (status === "pending") {
    if (timestampMs !== null && nowMs - timestampMs >= CMV_PENDING_STALE_MS) {
      return "pending_stale";
    }
    return "pending";
  }

  if (status === "failed") {
    return "failed";
  }

  // Backward compatibility for rows created before cmv_status existed.
  if (item.created_at) {
    const createdAtMs = new Date(item.created_at).getTime();
    const isRecentlyAdded =
      Number.isFinite(createdAtMs) && nowMs - createdAtMs < NEW_CARD_CMV_WINDOW_MS;
    if (isRecentlyAdded) {
      return "pending";
    }
  }

  return "unavailable";
};

export const isNewCardCmvPending = (
  item: Partial<CollectionItem>,
  nowMs = Date.now()
): boolean => {
  const state = getCollectionCmvUiState(item, nowMs);
  return state === "pending" || state === "pending_stale";
};
