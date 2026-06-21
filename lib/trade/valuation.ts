/**
 * Trade valuation helpers — pure functions, safe to import on client or server.
 * Compute each side's value, factor in cash on top, and report the balance.
 */

import { TRADE_BALANCE_TOLERANCE_CENTS } from "./config";
import type { TradeItem, TradeSide } from "./types";

export interface TradeValuation {
  initiatorCardCents: number;
  recipientCardCents: number;
  cashFrom: TradeSide | null;
  cashCents: number;
  /** Total value the initiator gives up (their cards + cash if they pay). */
  initiatorGivesCents: number;
  /** Total value the recipient gives up (their cards + cash if they pay). */
  recipientGivesCents: number;
  /** initiatorGives − recipientGives. Positive ⇒ initiator side is heavier. */
  differenceCents: number;
  /** Combined value of both sides' cards plus any cash — the middleman fee base. */
  totalValueCents: number;
  balanced: boolean;
}

export function sumSide(
  items: Array<Pick<TradeItem, "side" | "estimated_value_cents">>,
  side: TradeSide
): number {
  return items
    .filter((i) => i.side === side)
    .reduce((sum, i) => sum + (i.estimated_value_cents || 0), 0);
}

export function valuateTrade(
  items: Array<Pick<TradeItem, "side" | "estimated_value_cents">>,
  cashFrom: TradeSide | null,
  cashCents: number,
  toleranceCents: number = TRADE_BALANCE_TOLERANCE_CENTS
): TradeValuation {
  const initiatorCardCents = sumSide(items, "initiator");
  const recipientCardCents = sumSide(items, "recipient");
  const cash = Math.max(0, cashCents || 0);

  const initiatorGivesCents =
    initiatorCardCents + (cashFrom === "initiator" ? cash : 0);
  const recipientGivesCents =
    recipientCardCents + (cashFrom === "recipient" ? cash : 0);
  const differenceCents = initiatorGivesCents - recipientGivesCents;

  return {
    initiatorCardCents,
    recipientCardCents,
    cashFrom,
    cashCents: cash,
    initiatorGivesCents,
    recipientGivesCents,
    differenceCents,
    totalValueCents: initiatorCardCents + recipientCardCents + cash,
    balanced: Math.abs(differenceCents) <= toleranceCents,
  };
}

/**
 * Suggest which side should add cash (and how much) to balance the card values.
 * If the initiator's cards are worth more, the recipient owes cash, and vice
 * versa.
 */
export function suggestCashToBalance(
  initiatorCardCents: number,
  recipientCardCents: number
): { side: TradeSide | null; cents: number } {
  const diff = initiatorCardCents - recipientCardCents;
  if (diff === 0) return { side: null, cents: 0 };
  return diff > 0
    ? { side: "recipient", cents: diff }
    : { side: "initiator", cents: -diff };
}
