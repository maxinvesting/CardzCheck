"use client";

import { useMemo, useState } from "react";
import TradeCardTile from "./TradeCardTile";
import { formatCents } from "@/lib/trade/format";
import { suggestCashToBalance, valuateTrade } from "@/lib/trade/valuation";
import { TRADE_MAX_CASH_CENTS } from "@/lib/trade/config";
import type { TradeableCard, TradeSide } from "@/lib/trade/types";

type CashDir = "none" | "me" | "them";

export interface TradeBuilderPayload {
  initiator_item_ids: string[];
  recipient_item_ids: string[];
  cash_from: TradeSide | null;
  cash_cents: number;
  note: string;
}

/**
 * Shared two-sided trade composer. Works for the initiator (create) and the
 * recipient (counter) — `mySide` controls how selections map onto the absolute
 * initiator/recipient item lists the API expects.
 */
export default function TradeBuilder({
  mySide,
  myCards,
  theirCards,
  partnerName,
  initialMyIds = [],
  initialTheirIds = [],
  initialCashDir = "none",
  initialCashCents = 0,
  initialNote = "",
  submitLabel,
  onSubmit,
}: {
  mySide: TradeSide;
  myCards: TradeableCard[];
  theirCards: TradeableCard[];
  partnerName: string;
  initialMyIds?: string[];
  initialTheirIds?: string[];
  initialCashDir?: CashDir;
  initialCashCents?: number;
  initialNote?: string;
  submitLabel: string;
  onSubmit: (payload: TradeBuilderPayload) => Promise<void>;
}) {
  const otherSide: TradeSide = mySide === "initiator" ? "recipient" : "initiator";
  const [mine, setMine] = useState<Set<string>>(new Set(initialMyIds));
  const [theirs, setTheirs] = useState<Set<string>>(new Set(initialTheirIds));
  const [cashDir, setCashDir] = useState<CashDir>(initialCashDir);
  const [cashStr, setCashStr] = useState(
    initialCashCents > 0 ? (initialCashCents / 100).toFixed(2) : ""
  );
  const [note, setNote] = useState(initialNote);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cashCents = Math.round((Number(cashStr) || 0) * 100);

  const valuation = useMemo(() => {
    const items = [
      ...myCards
        .filter((c) => mine.has(c.id))
        .map((c) => ({ side: mySide, estimated_value_cents: c.estimated_value_cents })),
      ...theirCards
        .filter((c) => theirs.has(c.id))
        .map((c) => ({ side: otherSide, estimated_value_cents: c.estimated_value_cents })),
    ];
    const cashFrom: TradeSide | null =
      cashDir === "me" ? mySide : cashDir === "them" ? otherSide : null;
    return valuateTrade(items, cashFrom, cashDir === "none" ? 0 : cashCents);
  }, [myCards, theirCards, mine, theirs, cashDir, cashCents, mySide, otherSide]);

  const myCardCents = mySide === "initiator" ? valuation.initiatorCardCents : valuation.recipientCardCents;
  const theirCardCents = mySide === "initiator" ? valuation.recipientCardCents : valuation.initiatorCardCents;

  function toggle(set: Set<string>, setter: (s: Set<string>) => void, id: string) {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setter(next);
  }

  function applyBalanceSuggestion() {
    const s = suggestCashToBalance(myCardCents, theirCardCents);
    if (s.side === null || s.cents <= 0) {
      setCashDir("none");
      setCashStr("");
      return;
    }
    // s.side is in "initiator owes / recipient owes" terms relative to card sums.
    // Translate to me/them.
    setCashDir(s.side === mySide ? "me" : "them");
    setCashStr((s.cents / 100).toFixed(2));
  }

  async function handleSubmit() {
    setError(null);
    if (mine.size === 0 && theirs.size === 0) {
      setError("Add at least one card to the trade.");
      return;
    }
    if (cashDir !== "none" && cashCents <= 0) {
      setError("Enter a cash amount, or choose “No cash”.");
      return;
    }
    if (cashCents > TRADE_MAX_CASH_CENTS) {
      setError("Cash amount is too large.");
      return;
    }
    const cashFrom: TradeSide | null =
      cashDir === "me" ? mySide : cashDir === "them" ? otherSide : null;

    // Map selections onto absolute initiator/recipient lists.
    const myIds = Array.from(mine);
    const theirIds = Array.from(theirs);
    const payload: TradeBuilderPayload = {
      initiator_item_ids: mySide === "initiator" ? myIds : theirIds,
      recipient_item_ids: mySide === "initiator" ? theirIds : myIds,
      cash_from: cashFrom,
      cash_cents: cashDir === "none" ? 0 : cashCents,
      note: note.trim(),
    };
    setSubmitting(true);
    try {
      await onSubmit(payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setSubmitting(false);
    }
  }

  const diffAbs = Math.abs(valuation.differenceCents);
  const heavierIsMe =
    (mySide === "initiator" && valuation.differenceCents > 0) ||
    (mySide === "recipient" && valuation.differenceCents < 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-5 lg:grid-cols-2">
        <Column
          title="You give"
          subtitle={`${mine.size} card${mine.size === 1 ? "" : "s"} · ${formatCents(myCardCents)}`}
        >
          {myCards.length === 0 ? (
            <Empty text="You have no cards flagged “Available for Trade”. Add some from your binder." />
          ) : (
            <Grid>
              {myCards.map((c) => (
                <TradeCardTile
                  key={c.id}
                  card={c}
                  selected={mine.has(c.id)}
                  onToggle={() => toggle(mine, setMine, c.id)}
                />
              ))}
            </Grid>
          )}
        </Column>

        <Column
          title={`You receive from ${partnerName}`}
          subtitle={`${theirs.size} card${theirs.size === 1 ? "" : "s"} · ${formatCents(theirCardCents)}`}
        >
          {theirCards.length === 0 ? (
            <Empty text={`${partnerName} has no cards available for trade.`} />
          ) : (
            <Grid>
              {theirCards.map((c) => (
                <TradeCardTile
                  key={c.id}
                  card={c}
                  selected={theirs.has(c.id)}
                  onToggle={() => toggle(theirs, setTheirs, c.id)}
                />
              ))}
            </Grid>
          )}
        </Column>
      </div>

      {/* Cash + balance */}
      <div className="border border-[color:var(--biz-border)] bg-[color:var(--biz-surface)] p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <div className="mb-1 text-[10px] font-medium uppercase tracking-[0.08em] text-[color:var(--biz-muted)]">
              Cash on top
            </div>
            <div className="flex gap-1">
              {(["none", "me", "them"] as CashDir[]).map((dir) => (
                <button
                  key={dir}
                  type="button"
                  onClick={() => setCashDir(dir)}
                  className={`h-8 border px-3 text-[12px] font-medium transition-colors ${
                    cashDir === dir
                      ? "border-[color:var(--biz-primary)] bg-[color:var(--biz-primary-soft)] text-[color:var(--biz-text-strong)]"
                      : "border-[color:var(--biz-border)] text-[color:var(--biz-muted)] hover:border-[color:var(--biz-border-strong)]"
                  }`}
                >
                  {dir === "none" ? "No cash" : dir === "me" ? "I add cash" : "They add cash"}
                </button>
              ))}
            </div>
          </div>

          {cashDir !== "none" ? (
            <div>
              <div className="mb-1 text-[10px] font-medium uppercase tracking-[0.08em] text-[color:var(--biz-muted)]">
                Amount (USD)
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[color:var(--biz-muted)]">$</span>
                <input
                  inputMode="decimal"
                  value={cashStr}
                  onChange={(e) => setCashStr(e.target.value.replace(/[^0-9.]/g, ""))}
                  placeholder="0.00"
                  className="h-8 w-28 border border-[color:var(--biz-border)] bg-[color:var(--biz-near-black)] px-2 text-[13px] text-[color:var(--biz-text)] focus:border-[color:var(--biz-focus)] focus:outline-none"
                />
              </div>
            </div>
          ) : null}

          <button
            type="button"
            onClick={applyBalanceSuggestion}
            className="ml-auto h-8 border border-[color:var(--biz-border)] px-3 text-[12px] font-medium text-[color:var(--biz-muted-strong)] hover:border-[color:var(--biz-border-strong)] hover:text-[color:var(--biz-text)]"
          >
            Balance with cash
          </button>
        </div>

        {/* Valuation readout */}
        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-[color:var(--biz-border)] pt-3 text-[12px]">
          <span className="text-[color:var(--biz-muted)]">
            You give{" "}
            <span className="font-semibold text-[color:var(--biz-text)]">
              {formatCents(valuation[mySide === "initiator" ? "initiatorGivesCents" : "recipientGivesCents"])}
            </span>
          </span>
          <span className="text-[color:var(--biz-muted)]">
            You receive{" "}
            <span className="font-semibold text-[color:var(--biz-text)]">
              {formatCents(valuation[mySide === "initiator" ? "recipientGivesCents" : "initiatorGivesCents"])}
            </span>
          </span>
          {valuation.balanced ? (
            <span className="font-semibold text-[color:var(--biz-profit)]">Balanced</span>
          ) : (
            <span className="font-semibold text-[color:var(--biz-accent-amber,#d8a657)]">
              {heavierIsMe ? "You give" : "You receive"} {formatCents(diffAbs)} more
            </span>
          )}
        </div>
      </div>

      {/* Note */}
      <div>
        <div className="mb-1 text-[10px] font-medium uppercase tracking-[0.08em] text-[color:var(--biz-muted)]">
          Note to {partnerName} (optional)
        </div>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          maxLength={2000}
          placeholder="Add context for your offer…"
          className="w-full border border-[color:var(--biz-border)] bg-[color:var(--biz-near-black)] px-3 py-2 text-[13px] text-[color:var(--biz-text)] focus:border-[color:var(--biz-focus)] focus:outline-none"
        />
      </div>

      {error ? (
        <div className="border border-[color:var(--biz-danger-border)] bg-[color:var(--biz-danger-soft)] px-3 py-2 text-[12px] text-[color:var(--biz-danger)]">
          {error}
        </div>
      ) : null}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="h-10 border border-[color:var(--biz-primary-border)] bg-[color:var(--biz-primary)] px-6 text-[13px] font-semibold text-[color:var(--biz-primary-foreground)] transition-colors hover:bg-[color:var(--biz-primary-hover)] disabled:opacity-60"
        >
          {submitting ? "Sending…" : submitLabel}
        </button>
      </div>
    </div>
  );
}

function Column({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-[13px] font-semibold text-[color:var(--biz-text-strong)]">{title}</h3>
        <span className="text-[11px] text-[color:var(--biz-muted)]">{subtitle}</span>
      </div>
      <div className="max-h-[420px] overflow-y-auto border border-[color:var(--biz-border)] bg-[color:var(--biz-surface)] p-2">
        {children}
      </div>
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">{children}</div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="flex h-32 items-center justify-center px-4 text-center text-[11px] text-[color:var(--biz-muted)]">
      {text}
    </div>
  );
}
