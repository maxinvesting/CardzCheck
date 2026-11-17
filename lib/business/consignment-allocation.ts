/**
 * Consignment payout allocation — pure, shared by the settle API and the UI
 * preview so the numbers you see are the numbers that get booked.
 *
 * equal_loss:   every card takes the same share of the order's loss (or gain):
 *               payout_i = cost_i + (payout_total − Σcost) / n
 * proportional: payout split in proportion to each card's cost, so every card
 *               recovers the same percentage of what it cost.
 *
 * Leftover cents from rounding go to the first cards so the parts always sum
 * exactly to the payout total.
 */

export type ConsignmentSplitMethod = "equal_loss" | "proportional";

export function allocateConsignmentPayout(
  costsCents: number[],
  payoutTotalCents: number,
  method: ConsignmentSplitMethod
): number[] {
  const n = costsCents.length;
  if (n === 0) return [];
  const costs = costsCents.map((c) => Math.round(Number(c) || 0));
  const payout = Math.round(Number(payoutTotalCents) || 0);
  const costTotal = costs.reduce((sum, c) => sum + c, 0);

  let parts: number[];
  if (method === "proportional" && costTotal > 0) {
    parts = costs.map((c) => Math.floor((payout * c) / costTotal));
  } else if (method === "proportional") {
    parts = costs.map(() => Math.floor(payout / n));
  } else {
    const share = Math.trunc((payout - costTotal) / n);
    parts = costs.map((c) => c + share);
  }

  let remainder = payout - parts.reduce((sum, p) => sum + p, 0);
  const step = remainder > 0 ? 1 : -1;
  for (let i = 0; remainder !== 0; i = (i + 1) % n) {
    parts[i] += step;
    remainder -= step;
  }
  return parts;
}

export interface ConsignmentTotals {
  costCents: number;
  payoutCents: number;
  profitCents: number;
  /** payout / cost, 0–1+ ; null when cost is 0 */
  recovery: number | null;
}

export function consignmentTotals(costCents: number, payoutCents: number): ConsignmentTotals {
  return {
    costCents,
    payoutCents,
    profitCents: payoutCents - costCents,
    recovery: costCents > 0 ? payoutCents / costCents : null,
  };
}
