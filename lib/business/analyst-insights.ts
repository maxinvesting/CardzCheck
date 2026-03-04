import type { BusinessInventoryItem } from "@/types";

// ---------------------------------------------------------------------------
// Signal type for "Today's Actions" dashboard
// ---------------------------------------------------------------------------

export type ActionSignalType =
  | "list"
  | "reprice"
  | "market_pulse_gainer"
  | "market_pulse_loser";

export interface ActionSignal {
  type: ActionSignalType;
  title: string;
  detail: string;
  daysHeld: number | null;
  itemId: string;
}

// ---------------------------------------------------------------------------
// Full insights structure (signals + coverage metrics)
// ---------------------------------------------------------------------------

export interface BusinessAnalystInsights {
  /** Today's Actions signals — replaces the old four-category system. */
  actions: ActionSignal[];
  /** Legacy summary counters kept for the preview card. */
  summary: {
    unlistedActiveCount: number;
    actionCount: number;
  };
  coverage: {
    totalItems: number;
    activeItems: number;
    cmvCoveragePct: number;
    listCoveragePct: number;
  };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const UNLISTED_STALE_DAYS = 60;
const REPRICE_GAP_PCT = 0.20; // CMV must be >= 20% above list price
const LIST_MIN_CMV_CENTS = 1500; // $15 minimum CMV to fire a "list" signal
const MARKET_PULSE_MIN_PCT = 0.10; // 10% movement threshold

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function currency(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

function percent(value: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((value / total) * 100);
}

function computeDaysHeld(item: BusinessInventoryItem, now: Date): number | null {
  if (!item.acquisition_date) return null;
  const acquiredMs = Date.parse(item.acquisition_date);
  if (Number.isNaN(acquiredMs)) return null;
  return Math.floor((now.getTime() - acquiredMs) / MS_PER_DAY);
}

// ---------------------------------------------------------------------------
// Main generator
// ---------------------------------------------------------------------------

export function generateBusinessAnalystInsights(
  items: BusinessInventoryItem[],
  now: Date = new Date()
): BusinessAnalystInsights {
  if (items.length === 0) {
    return {
      actions: [],
      summary: { unlistedActiveCount: 0, actionCount: 0 },
      coverage: {
        totalItems: 0,
        activeItems: 0,
        cmvCoveragePct: 0,
        listCoveragePct: 0,
      },
    };
  }

  const activeItems = items.filter(
    (item) => item.status !== "sold" && item.status !== "returned"
  );

  // Coverage stats ----------------------------------------------------------

  const unlistedCount = activeItems.filter((i) => i.status === "unlisted").length;

  const cmvItems = activeItems.filter(
    (i) => i.current_market_value_cents != null && i.current_market_value_cents > 0
  );
  const listedWithPrice = activeItems.filter(
    (i) => i.list_price_cents != null && i.list_price_cents > 0
  );

  const cmvCoveragePct = percent(cmvItems.length, activeItems.length);
  const listCoveragePct = percent(listedWithPrice.length, activeItems.length);

  // Build action signals ----------------------------------------------------

  const actions: ActionSignal[] = [];

  for (const item of activeItems) {
    const daysHeld = computeDaysHeld(item, now);
    const cmv = item.current_market_value_cents ?? 0;
    const listPrice = item.list_price_cents ?? 0;

    // 1. LIST signal — unlisted 60+ days, CMV > $15
    if (
      item.status === "unlisted" &&
      daysHeld !== null &&
      daysHeld >= UNLISTED_STALE_DAYS &&
      cmv >= LIST_MIN_CMV_CENTS
    ) {
      actions.push({
        type: "list",
        title: item.title,
        detail: `Unlisted ${daysHeld} days — Est. MV ${currency(cmv)}`,
        daysHeld,
        itemId: item.id,
      });
    }

    // 2. REPRICE signal — CMV is 20%+ above current list price
    if (
      item.status === "listed" &&
      listPrice > 0 &&
      cmv > 0 &&
      cmv >= listPrice * (1 + REPRICE_GAP_PCT)
    ) {
      const gapPct = Math.round(((cmv - listPrice) / listPrice) * 100);
      actions.push({
        type: "reprice",
        title: item.title,
        detail: `Est. MV ${currency(cmv)} is ${gapPct}% above list price ${currency(listPrice)}`,
        daysHeld,
        itemId: item.id,
      });
    }
  }

  // 3. MARKET PULSE — weekly gainers/losers with 10%+ movement
  //    We compare current_market_value_cents to cost_basis as a proxy for
  //    movement direction and magnitude when we lack historical CMV snapshots.
  //    Items with CMV are evaluated: if CMV moved 10%+ from cost basis we
  //    surface them. No arbitrary top-3 limit.

  for (const item of activeItems) {
    const cmv = item.current_market_value_cents ?? 0;
    const cost = item.cost_basis_total_cents || 0;
    if (cmv <= 0 || cost <= 0) continue;

    const daysHeld = computeDaysHeld(item, now);
    const movementPct = (cmv - cost) / cost;

    if (movementPct >= MARKET_PULSE_MIN_PCT) {
      actions.push({
        type: "market_pulse_gainer",
        title: item.title,
        detail: `Est. MV ${currency(cmv)} — up ${Math.round(movementPct * 100)}% from cost basis ${currency(cost)}`,
        daysHeld,
        itemId: item.id,
      });
    } else if (movementPct <= -MARKET_PULSE_MIN_PCT) {
      actions.push({
        type: "market_pulse_loser",
        title: item.title,
        detail: `Est. MV ${currency(cmv)} — down ${Math.abs(Math.round(movementPct * 100))}% from cost basis ${currency(cost)}`,
        daysHeld,
        itemId: item.id,
      });
    }
  }

  return {
    actions,
    summary: {
      unlistedActiveCount: unlistedCount,
      actionCount: actions.length,
    },
    coverage: {
      totalItems: items.length,
      activeItems: activeItems.length,
      cmvCoveragePct,
      listCoveragePct,
    },
  };
}
