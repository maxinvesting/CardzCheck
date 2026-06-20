"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import TradeCardTile from "./TradeCardTile";
import { formatCents, statusMeta, TONE_CLASS } from "@/lib/trade/format";
import type { BinderCard, TradeDetail } from "@/lib/trade/types";
import type { OwnInventoryCard } from "@/lib/trade/queries";

type View = "trades" | "browse" | "binder";

export default function TradeCenterClient({
  currentUserId,
  initialView,
  myTrades,
  browse,
  inventory,
  ownerNames,
}: {
  currentUserId: string;
  initialView: string;
  myTrades: TradeDetail[];
  browse: BinderCard[];
  inventory: OwnInventoryCard[];
  ownerNames: Record<string, string | null>;
}) {
  const [view, setView] = useState<View>(
    initialView === "browse" || initialView === "binder" ? initialView : "trades"
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold text-[color:var(--biz-text-strong)]">
            Trade Center
          </h1>
          <p className="mt-0.5 text-[13px] text-[color:var(--biz-muted)]">
            Swap cards with other collectors. Both sides approve, then ship direct.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setView("browse")}
          className="h-9 border border-[color:var(--biz-primary-border)] bg-[color:var(--biz-primary)] px-4 text-[13px] font-semibold text-[color:var(--biz-primary-foreground)] hover:bg-[color:var(--biz-primary-hover)]"
        >
          Start a trade
        </button>
      </header>

      {/* Segmented control */}
      <div className="mb-5 inline-flex border border-[color:var(--biz-border)]">
        {(
          [
            ["trades", "My Trades"],
            ["browse", "Browse"],
            ["binder", `My Binder${inventory.filter((c) => c.is_tradeable).length ? ` · ${inventory.filter((c) => c.is_tradeable).length}` : ""}`],
          ] as [View, string][]
        ).map(([key, label], i) => (
          <button
            key={key}
            type="button"
            onClick={() => setView(key)}
            className={`h-9 px-4 text-[12px] font-medium transition-colors ${i > 0 ? "border-l border-[color:var(--biz-border)]" : ""} ${
              view === key
                ? "bg-[color:var(--biz-surface-soft)] text-[color:var(--biz-text-strong)]"
                : "text-[color:var(--biz-muted)] hover:text-[color:var(--biz-text)]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {view === "trades" ? (
        <TradesView trades={myTrades} currentUserId={currentUserId} onBrowse={() => setView("browse")} />
      ) : view === "browse" ? (
        <BrowseView cards={browse} ownerNames={ownerNames} />
      ) : (
        <BinderView initial={inventory} />
      )}
    </div>
  );
}

// ── My Trades ────────────────────────────────────────────────────────────────

function TradesView({
  trades,
  currentUserId,
  onBrowse,
}: {
  trades: TradeDetail[];
  currentUserId: string;
  onBrowse: () => void;
}) {
  const groups = useMemo(() => {
    const needsResponse: TradeDetail[] = [];
    const awaiting: TradeDetail[] = [];
    const inProgress: TradeDetail[] = [];
    const closed: TradeDetail[] = [];
    for (const t of trades) {
      const mySide = t.initiator_id === currentUserId ? "initiator" : "recipient";
      const myApproved = mySide === "initiator" ? t.initiator_approved : t.recipient_approved;
      const negotiating = t.status === "proposed" || t.status === "countered";
      if (negotiating && !myApproved) needsResponse.push(t);
      else if (negotiating && myApproved) awaiting.push(t);
      else if (["accepted", "cash_pending", "confirmed", "shipped"].includes(t.status)) inProgress.push(t);
      else closed.push(t);
    }
    return { needsResponse, awaiting, inProgress, closed };
  }, [trades, currentUserId]);

  if (trades.length === 0) {
    return (
      <EmptyState
        title="No trades yet"
        body="Browse other collectors’ binders to send your first offer."
        actionLabel="Browse binders"
        onAction={onBrowse}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <TradeGroup title="Needs your response" trades={groups.needsResponse} currentUserId={currentUserId} highlight />
      <TradeGroup title="Awaiting partner" trades={groups.awaiting} currentUserId={currentUserId} />
      <TradeGroup title="In progress" trades={groups.inProgress} currentUserId={currentUserId} />
      <TradeGroup title="Completed & closed" trades={groups.closed} currentUserId={currentUserId} />
    </div>
  );
}

function TradeGroup({
  title,
  trades,
  currentUserId,
  highlight = false,
}: {
  title: string;
  trades: TradeDetail[];
  currentUserId: string;
  highlight?: boolean;
}) {
  if (trades.length === 0) return null;
  return (
    <section>
      <h2 className="mb-2 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.06em] text-[color:var(--biz-muted)]">
        {title}
        <span className="text-[color:var(--biz-faint)]">{trades.length}</span>
      </h2>
      <div className="flex flex-col gap-2">
        {trades.map((t) => (
          <TradeRow key={t.id} trade={t} currentUserId={currentUserId} highlight={highlight} />
        ))}
      </div>
    </section>
  );
}

function TradeRow({
  trade,
  currentUserId,
  highlight,
}: {
  trade: TradeDetail;
  currentUserId: string;
  highlight: boolean;
}) {
  const myItems = trade.items.filter((i) => i.owner_id === currentUserId);
  const theirItems = trade.items.filter((i) => i.owner_id !== currentUserId);
  const myValue = myItems.reduce((s, i) => s + (i.estimated_value_cents || 0), 0);
  const theirValue = theirItems.reduce((s, i) => s + (i.estimated_value_cents || 0), 0);
  const meta = statusMeta(trade.status);

  const mySide = trade.initiator_id === currentUserId ? "initiator" : "recipient";
  let cashLabel: string | null = null;
  if (trade.cash_cents > 0 && trade.cash_from) {
    cashLabel =
      trade.cash_from === mySide
        ? `You add ${formatCents(trade.cash_cents)}`
        : `They add ${formatCents(trade.cash_cents)}`;
  }

  return (
    <Link
      href={`/trade/${trade.id}`}
      className={`flex items-center gap-4 border px-4 py-3 transition-colors hover:bg-[color:var(--biz-hover)] ${
        highlight
          ? "border-[color:var(--biz-primary-border)] bg-[color:var(--biz-primary-soft)]"
          : "border-[color:var(--biz-border)] bg-[color:var(--biz-surface)]"
      }`}
    >
      <ThumbStack items={myItems} />
      <div className="flex shrink-0 flex-col items-center text-[color:var(--biz-faint)]">
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-3-3m3 3l-3 3M16 17H4m0 0l3 3m-3-3l3-3" />
        </svg>
      </div>
      <ThumbStack items={theirItems} />

      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-semibold text-[color:var(--biz-text-strong)]">
          {trade.counterparty_name ?? "Trader"}
        </div>
        <div className="mt-0.5 truncate text-[11px] text-[color:var(--biz-muted)]">
          You give {myItems.length} ({formatCents(myValue)}) · get {theirItems.length} ({formatCents(theirValue)})
          {cashLabel ? ` · ${cashLabel}` : ""}
        </div>
      </div>

      <span className={`shrink-0 border px-2 py-0.5 text-[10px] font-semibold uppercase ${TONE_CLASS[meta.tone]}`}>
        {meta.label}
      </span>
    </Link>
  );
}

function ThumbStack({ items }: { items: { id: string; image_url: string | null }[] }) {
  const shown = items.slice(0, 3);
  return (
    <div className="flex shrink-0 -space-x-3">
      {shown.length === 0 ? (
        <div className="h-12 w-9 border border-dashed border-[color:var(--biz-border)] bg-[color:var(--biz-near-black)]" />
      ) : (
        shown.map((it) => (
          <div
            key={it.id}
            className="h-12 w-9 overflow-hidden border border-[color:var(--biz-border)] bg-[color:var(--biz-near-black)]"
          >
            {it.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={it.image_url} alt="" className="h-full w-full object-cover" loading="lazy" />
            ) : null}
          </div>
        ))
      )}
      {items.length > 3 ? (
        <div className="flex h-12 w-9 items-center justify-center border border-[color:var(--biz-border)] bg-[color:var(--biz-near-black)] text-[10px] text-[color:var(--biz-muted)]">
          +{items.length - 3}
        </div>
      ) : null}
    </div>
  );
}

// ── Browse ───────────────────────────────────────────────────────────────────

function BrowseView({
  cards,
  ownerNames,
}: {
  cards: BinderCard[];
  ownerNames: Record<string, string | null>;
}) {
  if (cards.length === 0) {
    return (
      <EmptyState
        title="No cards available to trade yet"
        body="When other collectors flag cards as “Available for Trade,” they’ll show up here."
      />
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {cards.map((c) => (
        <Link
          key={c.id}
          href={`/trade/new?partner=${c.owner_id}&want=${c.id}`}
          className="group flex flex-col"
        >
          <TradeCardTile card={c} />
          <div className="mt-1 flex items-center justify-between gap-1 px-0.5">
            <span className="truncate text-[10px] text-[color:var(--biz-muted)]">
              {ownerNames[c.owner_id] ?? "Trader"}
            </span>
            <span className="shrink-0 text-[10px] font-semibold text-[color:var(--biz-link)] group-hover:underline">
              Propose →
            </span>
          </div>
        </Link>
      ))}
    </div>
  );
}

// ── My Binder ────────────────────────────────────────────────────────────────

function BinderView({ initial }: { initial: OwnInventoryCard[] }) {
  const [cards, setCards] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);

  async function toggle(id: string, next: boolean) {
    setBusy(id);
    try {
      const res = await fetch("/api/trade/tradeable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_id: id, tradeable: next }),
      });
      if (res.ok) {
        setCards((prev) => prev.map((c) => (c.id === id ? { ...c, is_tradeable: next } : c)));
      }
    } finally {
      setBusy(null);
    }
  }

  if (cards.length === 0) {
    return (
      <EmptyState
        title="Your inventory is empty"
        body="Add cards to your collection or ledger first, then flag them for trade here."
      />
    );
  }

  return (
    <div>
      <p className="mb-3 text-[12px] text-[color:var(--biz-muted)]">
        Flag cards as “Available for Trade” to show them in your public binder.
        Other collectors can then offer trades for them.
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {cards.map((c) => (
          <div key={c.id} className="flex flex-col">
            <TradeCardTile card={c} />
            <button
              type="button"
              disabled={busy === c.id}
              onClick={() => toggle(c.id, !c.is_tradeable)}
              className={`mt-1 h-7 border text-[11px] font-medium transition-colors disabled:opacity-60 ${
                c.is_tradeable
                  ? "border-[color:var(--biz-primary-border)] bg-[color:var(--biz-primary-soft)] text-[color:var(--biz-text-strong)]"
                  : "border-[color:var(--biz-border)] text-[color:var(--biz-muted)] hover:border-[color:var(--biz-border-strong)]"
              }`}
            >
              {c.is_tradeable ? "✓ In binder" : "Add to binder"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── shared ───────────────────────────────────────────────────────────────────

function EmptyState({
  title,
  body,
  actionLabel,
  onAction,
}: {
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center border border-dashed border-[color:var(--biz-border)] bg-[color:var(--biz-surface)] px-6 py-16 text-center">
      <h3 className="text-[15px] font-semibold text-[color:var(--biz-text-strong)]">{title}</h3>
      <p className="mt-1 max-w-sm text-[12px] text-[color:var(--biz-muted)]">{body}</p>
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="mt-4 h-9 border border-[color:var(--biz-primary-border)] bg-[color:var(--biz-primary)] px-4 text-[12px] font-semibold text-[color:var(--biz-primary-foreground)] hover:bg-[color:var(--biz-primary-hover)]"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
