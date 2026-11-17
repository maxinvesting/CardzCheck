/**
 * Consignment math, shared by the API and the form preview so what you see is
 * what gets booked.
 */

/** Split `totalCents` evenly across `n` cards; leftover cents go to the first cards. */
export function splitEvenly(totalCents: number, n: number): number[] {
  if (n <= 0) return [];
  const total = Math.round(Number(totalCents) || 0);
  const base = Math.trunc(total / n);
  const parts = Array.from({ length: n }, () => base);
  let remainder = total - base * n;
  const step = remainder > 0 ? 1 : -1;
  for (let i = 0; remainder !== 0; i = (i + 1) % n) {
    parts[i] += step;
    remainder -= step;
  }
  return parts;
}

export interface ConsignmentLine {
  costCents: number;
  soldCents: number;
}

export interface ConsignmentLineResult extends ConsignmentLine {
  feeCents: number;
  netCents: number;
  profitCents: number;
}

/** Per-card fee share, net and profit for an order whose fees total is split evenly. */
export function computeConsignmentLines(
  lines: ConsignmentLine[],
  feesTotalCents: number
): ConsignmentLineResult[] {
  const fees = splitEvenly(feesTotalCents, lines.length);
  return lines.map((line, i) => {
    const feeCents = fees[i] ?? 0;
    const netCents = line.soldCents - feeCents;
    return { ...line, feeCents, netCents, profitCents: netCents - line.costCents };
  });
}
