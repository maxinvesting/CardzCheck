"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import TradeCardTile from "./TradeCardTile";
import TradeBuilder, { type TradeBuilderPayload } from "./TradeBuilder";
import { formatCents, statusMeta, TONE_CLASS } from "@/lib/trade/format";
import { sideForUser } from "@/lib/trade/types";
import type { TradeDetail, TradeItem, TradeableCard } from "@/lib/trade/types";

export default function TradeDetailClient({
  trade,
  currentUserId,
  cashFlash,
  isSubscriber,
}: {
  trade: TradeDetail;
  currentUserId: string;
  cashFlash: "success" | "canceled" | null;
  isSubscriber: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [counterOpen, setCounterOpen] = useState(false);

  const mySide = sideForUser(trade, currentUserId);
  const myItems = trade.items.filter((i) => i.owner_id === currentUserId);
  const theirItems = trade.items.filter((i) => i.owner_id !== currentUserId);
  const myValue = sumValue(myItems);
  const theirValue = sumValue(theirItems);
  const meta = statusMeta(trade.status);

  const myApproved =
    mySide === "initiator" ? trade.initiator_approved : trade.recipient_approved;
  const theirApproved =
    mySide === "initiator" ? trade.recipient_approved : trade.initiator_approved;

  const iAmPayer = trade.cash_cents > 0 && trade.cash_from === mySide;
  const iAmCashReceiver =
    trade.cash_cents > 0 && trade.cash_from != null && trade.cash_from !== mySide;

  const myShipment = trade.shipments.find((s) => s.shipper_id === currentUserId);
  const theirShipment = trade.shipments.find((s) => s.shipper_id !== currentUserId);
  const iShipped = Boolean(myShipment?.shipped_at);

  const partner = trade.counterparty_name ?? "Trader";

  async function act(action: string, extra?: Record<string, unknown>) {
    setBusy(action);
    setError(null);
    try {
      const res = await fetch(`/api/trade/trades/${trade.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || json.error || "Action failed.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed.");
    } finally {
      setBusy(null);
    }
  }

  async function payCash() {
    setBusy("pay");
    setError(null);
    try {
      const res = await fetch(`/api/trade/trades/${trade.id}/cash-checkout`, {
        method: "POST",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.url) {
        throw new Error(json.message || json.error || "Couldn’t start payment.");
      }
      window.location.href = json.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t start payment.");
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <Link
        href="/trade"
        className="mb-4 inline-flex items-center gap-1 text-[12px] text-[color:var(--biz-muted)] hover:text-[color:var(--biz-text)]"
      >
        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Trade Center
      </Link>

      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-semibold text-[color:var(--biz-text-strong)]">
            Trade with {partner}
          </h1>
          <p className="mt-0.5 text-[12px] text-[color:var(--biz-muted)]">
            {myApproved ? "You approved" : "You haven’t approved"} ·{" "}
            {theirApproved ? `${partner} approved` : `${partner} hasn’t approved`}
          </p>
        </div>
        <span className={`border px-2.5 py-1 text-[11px] font-semibold uppercase ${TONE_CLASS[meta.tone]}`}>
          {meta.label}
        </span>
      </header>

      {cashFlash === "success" ? (
        <Banner tone="good">Cash payment received — this trade is confirmed. Time to ship!</Banner>
      ) : null}
      {cashFlash === "canceled" ? (
        <Banner tone="warn">Cash payment was canceled. You can try again below.</Banner>
      ) : null}

      {/* Two sides */}
      <div className="grid gap-4 sm:grid-cols-2">
        <SideColumn title="You give" value={myValue} items={myItems} cash={iAmPayer ? trade.cash_cents : 0} />
        <SideColumn
          title={`You receive from ${partner}`}
          value={theirValue}
          items={theirItems}
          cash={iAmCashReceiver ? trade.cash_cents : 0}
        />
      </div>

      {/* Settlement method */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border border-[color:var(--biz-border)] bg-[color:var(--biz-surface)] px-3 py-2.5 text-[12px]">
        <span className="text-[color:var(--biz-muted)]">
          Settlement:{" "}
          <span className="font-semibold text-[color:var(--biz-text)]">
            {trade.use_middleman ? "Middleman (mediated)" : "Direct ship-to-ship"}
          </span>
        </span>
        {trade.use_middleman ? (
          <span className="text-[color:var(--biz-muted)]">
            Platform fee{" "}
            <span className="font-semibold text-[color:var(--biz-text)]">
              {formatCents(trade.platform_fee_cents)}
            </span>{" "}
            (3% of total value)
          </span>
        ) : (
          <span className="font-semibold text-[color:var(--biz-profit)]">Free · membership</span>
        )}
      </div>

      {trade.note ? (
        <div className="mt-4 border border-[color:var(--biz-border)] bg-[color:var(--biz-surface)] p-3 text-[12px] text-[color:var(--biz-text)]">
          <span className="text-[color:var(--biz-muted)]">Note: </span>
          {trade.note}
        </div>
      ) : null}

      {error ? (
        <div className="mt-4 border border-[color:var(--biz-danger-border)] bg-[color:var(--biz-danger-soft)] px-3 py-2 text-[12px] text-[color:var(--biz-danger)]">
          {error}
        </div>
      ) : null}

      {/* Actions */}
      <div className="mt-5">
        {(trade.status === "proposed" || trade.status === "countered" || trade.status === "draft") &&
        mySide ? (
          <ActionRow>
            {!myApproved ? (
              <PrimaryBtn disabled={busy !== null} onClick={() => act("approve")}>
                {busy === "approve" ? "Approving…" : "Approve trade"}
              </PrimaryBtn>
            ) : (
              <span className="text-[12px] text-[color:var(--biz-muted)]">
                Waiting for {partner} to respond.
              </span>
            )}
            <SecondaryBtn disabled={busy !== null} onClick={() => setCounterOpen((v) => !v)}>
              {counterOpen ? "Close counter" : "Counter"}
            </SecondaryBtn>
            <DangerBtn disabled={busy !== null} onClick={() => act(mySide === "initiator" ? "cancel" : "decline")}>
              {mySide === "initiator" ? "Cancel" : "Decline"}
            </DangerBtn>
          </ActionRow>
        ) : null}

        {trade.status === "accepted" || trade.status === "cash_pending" ? (
          iAmPayer ? (
            <ActionRow>
              <PrimaryBtn disabled={busy !== null} onClick={payCash}>
                {busy === "pay" ? "Starting…" : `Pay ${formatCents(trade.cash_cents)} to confirm`}
              </PrimaryBtn>
              <span className="text-[11px] text-[color:var(--biz-muted)]">
                Secured by Stripe · paid to {partner} on confirmation.
              </span>
            </ActionRow>
          ) : (
            <Banner tone="warn">
              Waiting for {partner} to send {formatCents(trade.cash_cents)} before this trade confirms.
            </Banner>
          )
        ) : null}

        {(trade.status === "confirmed" || trade.status === "shipped") && mySide ? (
          iShipped ? (
            <Banner tone="good">
              You marked your cards shipped{myShipment?.tracking_number ? ` (${myShipment.tracking_number})` : ""}.
              {theirShipment?.shipped_at
                ? " Both sides have shipped."
                : ` Waiting for ${partner} to ship.`}
            </Banner>
          ) : (
            <ShipForm
              busy={busy === "mark_shipped"}
              onShip={(extra) => act("mark_shipped", extra)}
            />
          )
        ) : null}

        {trade.status === "completed" ? (
          <Banner tone="good">
            Trade complete. The swapped cards are now in each collection.
          </Banner>
        ) : null}
        {trade.status === "declined" ? <Banner tone="bad">This trade was declined.</Banner> : null}
        {trade.status === "canceled" ? <Banner tone="bad">This trade was canceled.</Banner> : null}
      </div>

      {/* Counter editor */}
      {counterOpen ? (
        <CounterEditor
          tradeId={trade.id}
          partnerId={mySide === "initiator" ? trade.recipient_id : trade.initiator_id}
          partnerName={partner}
          mySide={mySide!}
          myItems={myItems}
          theirItems={theirItems}
          trade={trade}
          isSubscriber={isSubscriber}
          onDone={() => {
            setCounterOpen(false);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}

function sumValue(items: TradeItem[]): number {
  return items.reduce((s, i) => s + (i.estimated_value_cents || 0), 0);
}

function SideColumn({
  title,
  value,
  items,
  cash,
}: {
  title: string;
  value: number;
  items: TradeItem[];
  cash: number;
}) {
  return (
    <div className="border border-[color:var(--biz-border)] bg-[color:var(--biz-surface)] p-3">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-[12px] font-semibold text-[color:var(--biz-text-strong)]">{title}</h3>
        <span className="text-[11px] text-[color:var(--biz-muted)]">
          {formatCents(value + cash)}
        </span>
      </div>
      {items.length === 0 && cash === 0 ? (
        <div className="py-6 text-center text-[11px] text-[color:var(--biz-faint)]">Nothing</div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {items.map((i) => (
            <TradeCardTile
              key={i.id}
              compact
              card={{
                player: i.player,
                title: i.title,
                year: i.year,
                grade: i.grade,
                grading_company: i.grading_company,
                image_url: i.image_url,
                estimated_value_cents: i.estimated_value_cents,
              }}
            />
          ))}
        </div>
      )}
      {cash > 0 ? (
        <div className="mt-2 border border-dashed border-[color:var(--biz-border)] px-2 py-1.5 text-center text-[12px] font-semibold text-[color:var(--biz-text)]">
          + {formatCents(cash)} cash
        </div>
      ) : null}
    </div>
  );
}

function ShipForm({
  busy,
  onShip,
}: {
  busy: boolean;
  onShip: (extra: Record<string, unknown>) => void;
}) {
  const [carrier, setCarrier] = useState("");
  const [tracking, setTracking] = useState("");
  return (
    <div className="border border-[color:var(--biz-border)] bg-[color:var(--biz-surface)] p-4">
      <div className="mb-2 text-[12px] font-semibold text-[color:var(--biz-text-strong)]">
        Ship your cards
      </div>
      <p className="mb-3 text-[11px] text-[color:var(--biz-muted)]">
        Mail your cards directly to your trade partner, then mark them shipped.
        Tracking is optional but recommended.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <input
          value={carrier}
          onChange={(e) => setCarrier(e.target.value)}
          placeholder="Carrier (USPS…)"
          className="h-8 w-36 border border-[color:var(--biz-border)] bg-[color:var(--biz-near-black)] px-2 text-[12px] text-[color:var(--biz-text)] focus:border-[color:var(--biz-focus)] focus:outline-none"
        />
        <input
          value={tracking}
          onChange={(e) => setTracking(e.target.value)}
          placeholder="Tracking #"
          className="h-8 w-44 border border-[color:var(--biz-border)] bg-[color:var(--biz-near-black)] px-2 text-[12px] text-[color:var(--biz-text)] focus:border-[color:var(--biz-focus)] focus:outline-none"
        />
        <PrimaryBtn
          disabled={busy}
          onClick={() =>
            onShip({
              carrier: carrier.trim() || undefined,
              tracking_number: tracking.trim() || undefined,
            })
          }
        >
          {busy ? "Saving…" : "Mark as shipped"}
        </PrimaryBtn>
      </div>
    </div>
  );
}

function CounterEditor({
  tradeId,
  partnerId,
  partnerName,
  mySide,
  myItems,
  theirItems,
  trade,
  isSubscriber,
  onDone,
}: {
  tradeId: string;
  partnerId: string;
  partnerName: string;
  mySide: "initiator" | "recipient";
  myItems: TradeItem[];
  theirItems: TradeItem[];
  trade: TradeDetail;
  isSubscriber: boolean;
  onDone: () => void;
}) {
  const [myCards, setMyCards] = useState<TradeableCard[] | null>(null);
  const [theirCards, setTheirCards] = useState<TradeableCard[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [invRes, binderRes] = await Promise.all([
          fetch("/api/trade/inventory"),
          fetch(`/api/trade/binder?user_id=${partnerId}`),
        ]);
        const inv = await invRes.json();
        const binder = await binderRes.json();
        if (!active) return;
        setMyCards(mergeCards(inv.cards ?? [], myItems));
        setTheirCards(mergeCards(binder.cards ?? [], theirItems));
      } catch {
        if (active) setLoadError("Couldn’t load cards for the counter.");
      }
    })();
    return () => {
      active = false;
    };
  }, [partnerId, myItems, theirItems]);

  async function submitCounter(payload: TradeBuilderPayload) {
    const res = await fetch(`/api/trade/trades/${tradeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "revise", ...payload }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.message || json.error || "Counter failed.");
    onDone();
  }

  const cashDir =
    trade.cash_cents > 0 && trade.cash_from
      ? trade.cash_from === mySide
        ? "me"
        : "them"
      : "none";

  return (
    <div className="mt-6 border-t border-[color:var(--biz-border)] pt-6">
      <h2 className="mb-3 text-[14px] font-semibold text-[color:var(--biz-text-strong)]">
        Counter-offer
      </h2>
      {loadError ? (
        <div className="text-[12px] text-[color:var(--biz-danger)]">{loadError}</div>
      ) : myCards === null || theirCards === null ? (
        <div className="py-8 text-center text-[12px] text-[color:var(--biz-muted)]">Loading cards…</div>
      ) : (
        <TradeBuilder
          mySide={mySide}
          myCards={myCards}
          theirCards={theirCards}
          partnerName={partnerName}
          isSubscriber={isSubscriber}
          initialMyIds={myItems.map((i) => i.collection_item_id).filter(Boolean) as string[]}
          initialTheirIds={theirItems.map((i) => i.collection_item_id).filter(Boolean) as string[]}
          initialCashDir={cashDir as "none" | "me" | "them"}
          initialCashCents={trade.cash_cents}
          initialNote={trade.note ?? ""}
          submitLabel="Send counter-offer"
          onSubmit={submitCounter}
        />
      )}
    </div>
  );
}

/** Ensure cards currently in the trade are present in the pick list. */
function mergeCards(cards: TradeableCard[], items: TradeItem[]): TradeableCard[] {
  const byId = new Map(cards.map((c) => [c.id, c]));
  for (const it of items) {
    if (it.collection_item_id && !byId.has(it.collection_item_id)) {
      byId.set(it.collection_item_id, {
        id: it.collection_item_id,
        title: it.title,
        player: it.player,
        year: it.year,
        grade: it.grade,
        grading_company: it.grading_company,
        image_url: it.image_url,
        estimated_value_cents: it.estimated_value_cents,
      });
    }
  }
  return Array.from(byId.values());
}

// ── little button + banner primitives ───────────────────────────────────────

function ActionRow({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2">{children}</div>;
}

function PrimaryBtn({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="h-9 border border-[color:var(--biz-primary-border)] bg-[color:var(--biz-primary)] px-4 text-[13px] font-semibold text-[color:var(--biz-primary-foreground)] hover:bg-[color:var(--biz-primary-hover)] disabled:opacity-60"
    >
      {children}
    </button>
  );
}

function SecondaryBtn({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="h-9 border border-[color:var(--biz-border)] px-4 text-[13px] font-medium text-[color:var(--biz-text)] hover:border-[color:var(--biz-border-strong)] disabled:opacity-60"
    >
      {children}
    </button>
  );
}

function DangerBtn({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="h-9 border border-[color:var(--biz-border)] px-4 text-[13px] font-medium text-[color:var(--biz-danger)] hover:border-[color:var(--biz-danger)] disabled:opacity-60"
    >
      {children}
    </button>
  );
}

function Banner({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "good" | "warn" | "bad";
}) {
  const cls =
    tone === "good"
      ? "border-[color:var(--biz-primary-border)] bg-[color:var(--biz-profit-soft)] text-[color:var(--biz-profit)]"
      : tone === "warn"
        ? "border-[color:var(--biz-automation-border,#caa24a)] bg-[color:var(--biz-automation-soft,rgba(216,166,87,0.12))] text-[color:var(--biz-accent-amber,#d8a657)]"
        : "border-[color:var(--biz-danger-border)] bg-[color:var(--biz-danger-soft)] text-[color:var(--biz-danger)]";
  return <div className={`border px-3 py-2 text-[12px] font-medium ${cls}`}>{children}</div>;
}
