import type { CollectionItem } from "@/types";

// Extended type so helpers can work with optional CMV fields
export interface ValuedCollectionItem extends CollectionItem {
  /**
   * Estimated current market value for this card.
   * Backed by CMV / comps engine when available.
   */
  est_cmv?: number | null;
  /**
   * Optional legacy fields some callers might provide.
   * We don't declare them on CollectionItem, but helpers
   * will look for them via `any` when present.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

export interface CollectionSummary {
  cardCount: number;
  /**
   * Collection Value = sum of estimated CMV only (no cost-basis fallback).
   * Cards without est_cmv contribute 0. P/L is CMV minus cost basis.
   */
  totalDisplayValue: number;
  /** Sum of purchase_price where present */
  totalCostBasis: number;
  /**
   * Sum of (est_cmv - cost_basis) for cards where BOTH exist.
   * Null when no cards have both values.
   */
  totalUnrealizedPL: number | null;
  /**
   * Weighted unrealized P/L %:
   * totalUnrealizedPL / totalCostBasisForPL
   * where totalCostBasisForPL only includes cards with both values.
   */
  totalUnrealizedPLPct: number | null;
  /** How many cards have a non-null, positive est_cmv */
  cardsWithCmv: number;
  /** How many cards have a non-null, positive purchase_price */
  cardsWithCostBasis: number;
  /** How many cards have both est_cmv and purchase_price */
  cardsWithBoth: number;
}

export type ValueSource = "cmv" | "cost_basis" | "none";

function getRawEstCmv(item: ValuedCollectionItem): number | null {
  // Primary field
  const direct = item.est_cmv;
  if (typeof direct === "number") return direct;
  // Allow alternate field names for flexibility (e.g., est_value, cmv)
  const anyItem = item as any;
  if (typeof anyItem.est_value === "number") return anyItem.est_value;
  if (typeof anyItem.cmv === "number") return anyItem.cmv;
  return null;
}

export function getEstCmv(item: ValuedCollectionItem): number | null {
  const raw = getRawEstCmv(item);
  if (raw === null || raw === undefined) return null;
  if (Number.isNaN(raw)) return null;
  return raw;
}

export function getCostBasis(item: ValuedCollectionItem): number | null {
  const cost = item.purchase_price;
  if (cost === null || cost === undefined) return null;
  if (Number.isNaN(cost)) return null;
  return cost;
}

/** Collection Value per card: CMV only. No cost-basis fallback. */
export function getCollectionValuePerCard(item: ValuedCollectionItem): number {
  const est = getEstCmv(item);
  if (est !== null && est > 0) return est;
  return 0;
}

/** Fallback value for sorting/display when you need a number (e.g. CMV or cost). */
export function getDisplayValue(item: ValuedCollectionItem): number {
  const est = getEstCmv(item);
  if (est !== null && est > 0) return est;
  const cost = getCostBasis(item);
  if (cost !== null && cost > 0) return cost;
  return 0;
}

export function getValueSource(item: ValuedCollectionItem): ValueSource {
  const est = getEstCmv(item);
  if (est !== null && est > 0) return "cmv";

  const cost = getCostBasis(item);
  if (cost !== null && cost > 0) return "cost_basis";

  return "none";
}

export function getUnrealizedPL(item: ValuedCollectionItem): number | null {
  const est = getEstCmv(item);
  const cost = getCostBasis(item);
  if (est === null || cost === null) return null;
  return est - cost;
}

export function getUnrealizedPLPct(item: ValuedCollectionItem): number | null {
  const pl = getUnrealizedPL(item);
  const cost = getCostBasis(item);
  if (pl === null || cost === null || cost <= 0) return null;
  return pl / cost;
}

export function computeCollectionSummary(
  items: ValuedCollectionItem[]
): CollectionSummary {
  let totalDisplayValue = 0;
  let totalCostBasis = 0;
  let totalUnrealizedPL: number | null = 0;
  let totalCostBasisForPL = 0;

  let cardsWithCmv = 0;
  let cardsWithCostBasis = 0;
  let cardsWithBoth = 0;

  for (const item of items) {
    totalDisplayValue += getCollectionValuePerCard(item);

    const cost = getCostBasis(item);
    if (cost !== null && cost > 0) {
      totalCostBasis += cost;
      cardsWithCostBasis += 1;
    }

    const est = getEstCmv(item);
    if (est !== null && est > 0) {
      cardsWithCmv += 1;
    }

    if (est !== null && cost !== null) {
      const pl = est - cost;
      totalUnrealizedPL = (totalUnrealizedPL ?? 0) + pl;
      totalCostBasisForPL += cost;
      cardsWithBoth += 1;
    }
  }

  const totalUnrealizedPLPct =
    totalUnrealizedPL !== null && totalCostBasisForPL > 0
      ? totalUnrealizedPL / totalCostBasisForPL
      : null;

  return {
    cardCount: items.length,
    totalDisplayValue,
    totalCostBasis,
    totalUnrealizedPL: cardsWithBoth > 0 ? totalUnrealizedPL : null,
    totalUnrealizedPLPct,
    cardsWithCmv,
    cardsWithCostBasis,
    cardsWithBoth,
  };
}

export interface PerformerMetrics {
  item: ValuedCollectionItem;
  estCmv: number | null;
  costBasis: number | null;
  dollarChange: number | null;
  pctChange: number | null;
}

export function computePerformers(
  items: ValuedCollectionItem[],
  limit = 5
): PerformerMetrics[] {
  const withBoth: PerformerMetrics[] = [];
  const withoutBoth: PerformerMetrics[] = [];

  for (const item of items) {
    const estCmv = getEstCmv(item);
    const costBasis = getCostBasis(item);

    if (estCmv !== null && costBasis !== null && costBasis > 0) {
      const dollarChange = estCmv - costBasis;
      const pctChange = dollarChange / costBasis;
      withBoth.push({ item, estCmv, costBasis, dollarChange, pctChange });
    } else {
      withoutBoth.push({
        item,
        estCmv,
        costBasis,
        dollarChange: null,
        pctChange: null,
      });
    }
  }

  withBoth.sort((a, b) => {
    // Sort primarily by % change descending, then by dollar change
    const pctA = a.pctChange ?? 0;
    const pctB = b.pctChange ?? 0;
    if (pctB !== pctA) return pctB - pctA;
    const dollarA = a.dollarChange ?? 0;
    const dollarB = b.dollarChange ?? 0;
    return dollarB - dollarA;
  });

  const top = withBoth.slice(0, limit);

  // If we still have room, append items without both values at the bottom
  if (top.length < limit && withoutBoth.length > 0) {
    top.push(...withoutBoth.slice(0, limit - top.length));
  }

  return top;
}

