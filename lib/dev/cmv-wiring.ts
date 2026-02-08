import type { CollectionItem } from "@/types";
import { computeCollectionSummary, getEstCmv } from "@/lib/values";

export type CmvWiringCompsResult = {
  compsCount: number;
  cmvMid: number | null;
  cmvLow?: number | null;
  cmvHigh?: number | null;
};

export type CmvWiringPersistInput = {
  cmvMid: number | null;
  updatedAt: string;
  compsCount: number;
};

export type CmvWiringDeps = {
  fetchComps: () => Promise<CmvWiringCompsResult>;
  persistCmv: (input: CmvWiringPersistInput) => Promise<CollectionItem | null>;
  fetchCollectionItems: () => Promise<CollectionItem[]>;
  fetchDashboardItems: () => Promise<CollectionItem[]>;
  now?: () => string;
};

export type CmvWiringReport = {
  cardId: string;
  cardKey: string;
  compsCount: number;
  cmvMid: number | null;
  cmvLow: number | null;
  cmvHigh: number | null;
  updatedAt: string;
  persistedItem: CollectionItem | null;
  collectionItem: CollectionItem | null;
  dashboardItem: CollectionItem | null;
  collectionItems: CollectionItem[];
  dashboardItems: CollectionItem[];
  collectionSummary: ReturnType<typeof computeCollectionSummary>;
  dashboardSummary: ReturnType<typeof computeCollectionSummary>;
  checks: {
    compsFetched: boolean;
    cmvComputed: boolean;
    cmvPersisted: boolean;
    collectionReturnsCmv: boolean;
    dashboardTotalsMatchCollection: boolean;
    nullToZeroBugPresent: boolean;
  };
};

const normalizeKeyPart = (value?: string | null): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.toLowerCase() : null;
};

export const buildCardKey = (identity: {
  player_name?: string | null;
  year?: string | null;
  set_name?: string | null;
  grade?: string | null;
  parallel_type?: string | null;
  card_number?: string | null;
}): string => {
  const parts = [
    normalizeKeyPart(identity.player_name),
    normalizeKeyPart(identity.year),
    normalizeKeyPart(identity.set_name),
    normalizeKeyPart(identity.grade),
    normalizeKeyPart(identity.parallel_type),
    normalizeKeyPart(identity.card_number),
  ].filter(Boolean) as string[];

  return parts.join("|");
};

const numbersMatch = (left: number | null, right: number | null): boolean => {
  if (left === null && right === null) return true;
  if (left === null || right === null) return false;
  return Math.abs(left - right) < 0.01;
};

export function buildCmvWiringReport(input: {
  cardId: string;
  cardKey: string;
  compsCount: number;
  cmvMid: number | null;
  cmvLow?: number | null;
  cmvHigh?: number | null;
  updatedAt: string;
  persistedItem: CollectionItem | null;
  collectionItems: CollectionItem[];
  dashboardItems: CollectionItem[];
}): CmvWiringReport {
  const collectionSummary = computeCollectionSummary(input.collectionItems);
  const dashboardSummary = computeCollectionSummary(input.dashboardItems);

  const persistedCmv = input.persistedItem
    ? getEstCmv(input.persistedItem as any)
    : null;

  const collectionItem =
    input.collectionItems.find((item) => item.id === input.cardId) ?? null;
  const dashboardItem =
    input.dashboardItems.find((item) => item.id === input.cardId) ?? null;

  const collectionCmv = collectionItem ? getEstCmv(collectionItem as any) : null;

  const compsFetched = input.compsCount > 0;
  const cmvComputed = input.cmvMid !== null && Number.isFinite(input.cmvMid);
  const cmvPersisted = numbersMatch(persistedCmv, input.cmvMid ?? null);
  const collectionReturnsCmv = numbersMatch(collectionCmv, input.cmvMid ?? null);

  const dashboardTotalsMatchCollection =
    numbersMatch(collectionSummary.totalDisplayValue, dashboardSummary.totalDisplayValue) &&
    numbersMatch(collectionSummary.totalUnrealizedPL, dashboardSummary.totalUnrealizedPL) &&
    collectionSummary.cardsWithCmv === dashboardSummary.cardsWithCmv;

  const nullToZeroBugPresent = [collectionSummary, dashboardSummary].some(
    (summary) => summary.cardsWithCmv === 0 && summary.totalDisplayValue !== null
  );

  return {
    cardId: input.cardId,
    cardKey: input.cardKey,
    compsCount: input.compsCount,
    cmvMid: input.cmvMid,
    cmvLow: input.cmvLow ?? null,
    cmvHigh: input.cmvHigh ?? null,
    updatedAt: input.updatedAt,
    persistedItem: input.persistedItem,
    collectionItem,
    dashboardItem,
    collectionItems: input.collectionItems,
    dashboardItems: input.dashboardItems,
    collectionSummary,
    dashboardSummary,
    checks: {
      compsFetched,
      cmvComputed,
      cmvPersisted,
      collectionReturnsCmv,
      dashboardTotalsMatchCollection,
      nullToZeroBugPresent,
    },
  };
}

export async function runCmvWiringCheck(params: {
  cardId: string;
  cardKey: string;
  deps: CmvWiringDeps;
}): Promise<CmvWiringReport> {
  const now = params.deps.now ?? (() => new Date().toISOString());
  const { compsCount, cmvMid, cmvLow, cmvHigh } = await params.deps.fetchComps();
  const updatedAt = now();
  const persistedItem = await params.deps.persistCmv({
    cmvMid,
    updatedAt,
    compsCount,
  });

  const [collectionItems, dashboardItems] = await Promise.all([
    params.deps.fetchCollectionItems(),
    params.deps.fetchDashboardItems(),
  ]);

  return buildCmvWiringReport({
    cardId: params.cardId,
    cardKey: params.cardKey,
    compsCount,
    cmvMid,
    cmvLow,
    cmvHigh,
    updatedAt,
    persistedItem,
    collectionItems,
    dashboardItems,
  });
}
