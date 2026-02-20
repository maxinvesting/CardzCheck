import type { BusinessInventoryItem } from "@/types";

/**
 * Summary of inventory value for a set of items.
 * Used for both total and filter-aware display.
 */
export interface InventoryValueSummary {
  /** Total cost basis in cents (sum of cost_basis_total_cents per line) */
  totalCostCents: number;
  /** Total CMV in cents (sum of current_market_value_cents * quantity when available) */
  totalCmvCents: number;
  /** Number of items in the set */
  itemCount: number;
  /** How many items have a non-null CMV */
  itemsWithCmv: number;
}

/**
 * Compute inventory value summary from items.
 * - cost_basis_total_cents: total cost per inventory line
 * - current_market_value_cents: per-unit CMV; we multiply by quantity for line total
 */
export function computeInventoryValueSummary(
  items: BusinessInventoryItem[]
): InventoryValueSummary {
  let totalCostCents = 0;
  let totalCmvCents = 0;
  let itemsWithCmv = 0;

  for (const item of items) {
    const cost = item.cost_basis_total_cents ?? 0;
    const qty = item.quantity ?? 1;
    const cmv = item.current_market_value_cents ?? null;

    totalCostCents += cost;

    if (cmv !== null && cmv > 0) {
      totalCmvCents += cmv * qty;
      itemsWithCmv += 1;
    }
  }

  return {
    totalCostCents,
    totalCmvCents,
    itemCount: items.length,
    itemsWithCmv,
  };
}
