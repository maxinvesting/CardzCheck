import type { BusinessInventoryItem } from "@/types";

export type LedgerValueSource = "cmv" | "fallback";
export type LedgerListingStatus = "Listed" | "Unlisted";

export interface LedgerTableRow {
  id: string;
  item: BusinessInventoryItem;
  cardLabel: string;
  cardMeta: string | null;
  gradeLabel: string;
  quantity: number;
  costBasisCents: number;
  estimatedValueCents: number | null;
  estimatedValueSource: LedgerValueSource | null;
  yourPriceCents: number | null;
  lowestListingCents: number | null;
  spreadPct: number | null;
  pnlCents: number | null;
  daysHeld: number | null;
  status: LedgerListingStatus;
}

export interface LedgerSummary {
  inventoryCount: number;
  totalCostBasisCents: number;
  totalEstimatedValueCents: number | null;
  estimatedPnlCents: number | null;
}

/** Sortable columns in the ledger table, keyed to a row field. */
export type LedgerSortColumn =
  | "card"
  | "cost"
  | "cmv"
  | "price"
  | "lowest"
  | "spread"
  | "pnl"
  | "days";

export type LedgerSortDirection = "asc" | "desc";

export interface LedgerSortState {
  column: LedgerSortColumn;
  direction: LedgerSortDirection;
}

export const DEFAULT_LEDGER_SORT: LedgerSortState = { column: "cmv", direction: "desc" };

/** First-click direction for a column: text reads best A→Z, numbers high→low. */
export function defaultSortDirection(column: LedgerSortColumn): LedgerSortDirection {
  return column === "card" ? "asc" : "desc";
}

/**
 * Next sort state when a header is clicked: clicking the active column flips
 * direction; clicking a new column resets to that column's default direction.
 */
export function nextLedgerSort(
  current: LedgerSortState,
  column: LedgerSortColumn
): LedgerSortState {
  if (current.column === column) {
    return { column, direction: current.direction === "desc" ? "asc" : "desc" };
  }
  return { column, direction: defaultSortDirection(column) };
}

/** Stable string token for a sort state (used as a <select> value). */
export function ledgerSortToken(state: LedgerSortState): string {
  return `${state.column}_${state.direction}`;
}

/** Preset sorts surfaced in the photo-grid dropdown (which has no clickable headers). */
export const LEDGER_SORT_PRESETS: ReadonlyArray<{ label: string; state: LedgerSortState }> = [
  { label: "Value: high to low", state: { column: "cmv", direction: "desc" } },
  { label: "Value: low to high", state: { column: "cmv", direction: "asc" } },
  { label: "P&L: high to low", state: { column: "pnl", direction: "desc" } },
  { label: "Cost: high to low", state: { column: "cost", direction: "desc" } },
  { label: "Name: A to Z", state: { column: "card", direction: "asc" } },
];

/** Comparator that always pushes null/undefined values to the end, regardless of direction. */
function compareNullable(
  a: number | null,
  b: number | null,
  dir: LedgerSortDirection
): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return dir === "desc" ? b - a : a - b;
}

const NUMERIC_COLUMN_SELECTORS: Record<
  Exclude<LedgerSortColumn, "card">,
  (row: LedgerTableRow) => number | null
> = {
  cost: (r) => r.costBasisCents,
  cmv: (r) => r.estimatedValueCents,
  price: (r) => r.yourPriceCents,
  lowest: (r) => r.lowestListingCents,
  spread: (r) => r.spreadPct,
  pnl: (r) => r.pnlCents,
  days: (r) => r.daysHeld,
};

/** Returns a new array of rows sorted by the given column + direction. Does not mutate the input. */
export function sortLedgerRows(
  rows: LedgerTableRow[],
  { column, direction }: LedgerSortState
): LedgerTableRow[] {
  const sorted = [...rows];
  if (column === "card") {
    const cmp = (a: LedgerTableRow, b: LedgerTableRow) =>
      a.cardLabel.localeCompare(b.cardLabel, "en", { sensitivity: "base" });
    return sorted.sort((a, b) => (direction === "asc" ? cmp(a, b) : -cmp(a, b)));
  }
  const select = NUMERIC_COLUMN_SELECTORS[column];
  return sorted.sort((a, b) => compareNullable(select(a), select(b), direction));
}

const FALLBACK_VALUE_CENT_FIELDS = [
  "last_known_price_cents",
  "last_price_cents",
] as const;

const FALLBACK_VALUE_DOLLAR_FIELDS = [
  "estimated_cmv",
  "est_cmv",
  "last_price",
] as const;

const LOWEST_LISTING_CENT_FIELDS = [
  "lowest_listing_cents",
  "lowest_listing_price_cents",
  "market_floor_cents",
  "market_floor_price_cents",
] as const;

const LOWEST_LISTING_DOLLAR_FIELDS = [
  "lowest_listing",
  "lowest_listing_price",
  "market_floor",
  "floor_price",
] as const;

function clean(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function finiteNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

function positiveCents(value: unknown): number | null {
  const numberValue = finiteNumber(value);
  if (numberValue == null || numberValue <= 0) return null;
  return Math.round(numberValue);
}

function positiveDollarsToCents(value: unknown): number | null {
  const numberValue = finiteNumber(value);
  if (numberValue == null || numberValue <= 0) return null;
  return Math.round(numberValue * 100);
}

function readOptionalCents(
  item: BusinessInventoryItem,
  centFields: readonly string[],
  dollarFields: readonly string[]
): number | null {
  const raw = item as unknown as Record<string, unknown>;

  for (const field of centFields) {
    const cents = positiveCents(raw[field]);
    if (cents != null) return cents;
  }

  for (const field of dollarFields) {
    const cents = positiveDollarsToCents(raw[field]);
    if (cents != null) return cents;
  }

  return null;
}

function normalizeQuantity(quantity: number | null | undefined): number {
  return Number.isInteger(quantity) && quantity != null && quantity > 0 ? quantity : 1;
}

function buildCardLabel(item: BusinessInventoryItem): string {
  const year = clean((item as { year?: string | null }).year);
  const player = clean((item as { player_name?: string | null }).player_name);
  const setName = clean((item as { set_name?: string | null }).set_name);
  const parallel = clean((item as { parallel_type?: string | null }).parallel_type);
  const insert = clean((item as { insert_type?: string | null }).insert_type);
  const title = clean(item.title);

  const structured = [year, player, setName, insert, parallel].filter(Boolean);
  if (player && (setName || year || parallel || insert)) {
    return structured.join(" ");
  }

  return title ?? player ?? "Untitled item";
}

function buildCardMeta(item: BusinessInventoryItem, quantity: number): string | null {
  const cardNumber = clean((item as { card_number?: string | null }).card_number);
  const parts = [
    cardNumber ? `#${cardNumber.replace(/^#/, "")}` : null,
    quantity > 1 ? `Qty ${quantity}` : null,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(" / ") : null;
}

function buildGradeLabel(item: BusinessInventoryItem): string {
  if (item.condition_status === "raw") return "Raw";
  const grader = clean(item.grading_company)?.toUpperCase() ?? null;
  const grade = clean(item.grade);
  if (grader && grade) return `${grader} ${grade}`;
  if (grade) return grade;
  return item.condition_status === "graded" ? "Graded" : "—";
}

function getDaysHeld(acquisitionDate: string | null | undefined): number | null {
  if (!acquisitionDate) return null;
  const acquiredAt = new Date(acquisitionDate);
  if (Number.isNaN(acquiredAt.getTime())) return null;
  return Math.floor((Date.now() - acquiredAt.getTime()) / 86_400_000);
}

function getEstimatedUnitValue(item: BusinessInventoryItem): {
  cents: number | null;
  source: LedgerValueSource | null;
} {
  const cmv = positiveCents(item.current_market_value_cents);
  if (cmv != null) return { cents: cmv, source: "cmv" };

  const fallback = readOptionalCents(
    item,
    FALLBACK_VALUE_CENT_FIELDS,
    FALLBACK_VALUE_DOLLAR_FIELDS
  );
  if (fallback != null) return { cents: fallback, source: "fallback" };

  return { cents: null, source: null };
}

function getSimpleListingStatus(item: BusinessInventoryItem): LedgerListingStatus {
  if (
    item.status === "listed" ||
    item.status === "pending_sale" ||
    positiveCents(item.list_price_cents) != null ||
    Boolean(item.ebay_item_id)
  ) {
    return "Listed";
  }

  return "Unlisted";
}

export function mapInventoryItemToLedgerRow(
  item: BusinessInventoryItem
): LedgerTableRow {
  const quantity = normalizeQuantity(item.quantity);
  const estimatedUnitValue = getEstimatedUnitValue(item);
  const estimatedValueCents =
    estimatedUnitValue.cents != null ? estimatedUnitValue.cents * quantity : null;
  const costBasisCents = item.cost_basis_total_cents ?? 0;
  const yourPriceCents = positiveCents(item.list_price_cents);
  const lowestListingCents = readOptionalCents(
    item,
    LOWEST_LISTING_CENT_FIELDS,
    LOWEST_LISTING_DOLLAR_FIELDS
  );
  const spreadPct =
    yourPriceCents != null && lowestListingCents != null && lowestListingCents > 0
      ? ((yourPriceCents - lowestListingCents) / lowestListingCents) * 100
      : null;
  const pnlCents =
    estimatedValueCents != null ? estimatedValueCents - costBasisCents : null;

  return {
    id: item.id,
    item,
    cardLabel: buildCardLabel(item),
    cardMeta: buildCardMeta(item, quantity),
    gradeLabel: buildGradeLabel(item),
    quantity,
    costBasisCents,
    estimatedValueCents,
    estimatedValueSource: estimatedUnitValue.source,
    yourPriceCents,
    lowestListingCents,
    spreadPct,
    pnlCents,
    daysHeld: getDaysHeld(item.acquisition_date),
    status: getSimpleListingStatus(item),
  };
}

export function mapInventoryToLedgerRows(
  items: BusinessInventoryItem[]
): LedgerTableRow[] {
  return items.map(mapInventoryItemToLedgerRow);
}

export function computeLedgerSummary(rows: LedgerTableRow[]): LedgerSummary {
  let inventoryCount = 0;
  let totalCostBasisCents = 0;
  let totalEstimatedValueCents = 0;
  let estimatedPnlCents = 0;
  let rowsWithEstimatedValue = 0;

  for (const row of rows) {
    inventoryCount += row.quantity;
    totalCostBasisCents += row.costBasisCents;

    if (row.estimatedValueCents != null && row.pnlCents != null) {
      totalEstimatedValueCents += row.estimatedValueCents;
      estimatedPnlCents += row.pnlCents;
      rowsWithEstimatedValue += 1;
    }
  }

  return {
    inventoryCount,
    totalCostBasisCents,
    totalEstimatedValueCents:
      rowsWithEstimatedValue > 0 ? totalEstimatedValueCents : null,
    estimatedPnlCents: rowsWithEstimatedValue > 0 ? estimatedPnlCents : null,
  };
}
