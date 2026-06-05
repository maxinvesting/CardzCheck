"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

interface ShipTo {
  name: string;
  phone?: string | null;
  street1: string;
  street2?: string | null;
  city: string;
  state: string;
  zip: string;
  country: string;
}

interface ConnectStatus {
  configured: boolean;
  account: {
    payouts_enabled: boolean;
    charges_enabled: boolean;
    details_submitted: boolean;
    ship_from: ShipTo | null;
  } | null;
  ready: boolean;
  has_ship_from: boolean;
}

interface SellerOrder {
  id: string;
  sale_price_cents: number;
  shipping_cents: number;
  fee_amount_cents: number;
  seller_payout_cents: number | null;
  fulfilled_by: "seller" | "platform";
  fulfillment_status: "paid" | "label_created" | "shipped" | "delivered" | "canceled";
  ship_to: ShipTo | null;
  carrier: string | null;
  service_level: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  label_url: string | null;
  completed_at: string;
  listings: {
    mode: "self_serve" | "full_service";
    fulfilled_by: "seller" | "platform";
    marketplace_cards: {
      title: string;
      player: string;
      year: number;
      grade: string;
      grading_service: string;
      image_url: string | null;
    };
  };
}

const MONEY = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const money = (c: number | null | undefined) => (c == null ? "—" : MONEY.format(c / 100));

const STATUS_CHIP: Record<string, string> = {
  paid: "border-amber-500/40 bg-amber-900/20 text-amber-300",
  label_created: "border-sky-500/40 bg-sky-900/20 text-sky-300",
  shipped: "border-indigo-500/40 bg-indigo-900/20 text-indigo-300",
  delivered: "border-emerald-500/40 bg-emerald-900/20 text-emerald-300",
  canceled: "border-red-500/40 bg-red-900/20 text-red-300",
};

const STATUS_LABEL: Record<string, string> = {
  paid: "Paid · needs label",
  label_created: "Label ready · ship it",
  shipped: "Shipped",
  delivered: "Delivered",
  canceled: "Canceled",
};

export default function SellerOrdersClient() {
  const [connect, setConnect] = useState<ConnectStatus | null>(null);
  const [orders, setOrders] = useState<SellerOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [cRes, oRes] = await Promise.all([
        fetch("/api/marketplace/connect", { cache: "no-store" }),
        fetch("/api/marketplace/orders?role=seller", { cache: "no-store" }),
      ]);
      const c = (await cRes.json()) as ConnectStatus;
      const o = await oRes.json();
      setConnect(c);
      setOrders((o.orders ?? []) as SellerOrder[]);
    } catch {
      setError("Failed to load. Refresh to retry.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function startOnboarding() {
    setBusyId("onboard");
    setError(null);
    try {
      const res = await fetch("/api/marketplace/connect/onboard", { method: "POST" });
      const body = await res.json();
      if (!res.ok || !body.url) throw new Error(body.error ?? "onboarding_failed");
      window.location.href = body.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "onboarding_failed");
      setBusyId(null);
    }
  }

  async function generateLabel(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/marketplace/orders/${id}/label`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(labelError(body.error) ?? body.error ?? "label_failed");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "label_failed");
    } finally {
      setBusyId(null);
    }
  }

  async function markShipped(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/marketplace/orders/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "mark_shipped" }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "update_failed");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "update_failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="min-h-screen bg-[#090B0D] text-[#E6E8EB]">
      <div className="mx-auto max-w-5xl px-4 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-[#77808C]">
              Marketplace
            </div>
            <h1 className="mt-0.5 text-[20px] font-semibold">Sales &amp; fulfillment</h1>
          </div>
          <div className="flex gap-2">
            <Link
              href="/marketplace/sell/listings"
              className="border border-[#343941] bg-[#0F1317] px-3 py-1.5 text-[12px] text-[#B8C0CC] hover:border-[#5A626E] hover:text-[#E6E8EB]"
            >
              My listings
            </Link>
            <Link
              href="/marketplace/orders"
              className="border border-[#343941] bg-[#0F1317] px-3 py-1.5 text-[12px] text-[#B8C0CC] hover:border-[#5A626E] hover:text-[#E6E8EB]"
            >
              My purchases
            </Link>
          </div>
        </div>

        {error ? (
          <div className="mt-4 border border-red-800/50 bg-red-950/40 p-3 text-[12px] text-red-200">
            {error}
          </div>
        ) : null}

        {/* Payout setup */}
        <PayoutPanel
          connect={connect}
          loading={loading}
          busy={busyId === "onboard"}
          onStart={startOnboarding}
          onSaved={load}
        />

        {/* Orders */}
        <section className="mt-6">
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-[#77808C]">
            Orders ({orders.length})
          </h2>
          {loading ? (
            <div className="mt-3 border border-dashed border-[#24282D] bg-[#0B0D0F] p-8 text-center text-[12px] text-[#77808C]">
              Loading…
            </div>
          ) : orders.length === 0 ? (
            <div className="mt-3 border border-dashed border-[#24282D] bg-[#0B0D0F] p-8 text-center text-[12px] text-[#77808C]">
              No sales yet. When a buyer purchases one of your listings, it shows up here to fulfill.
            </div>
          ) : (
            <div className="mt-3 space-y-3">
              {orders.map((o) => (
                <OrderCard
                  key={o.id}
                  order={o}
                  busy={busyId === o.id}
                  shipReady={!!connect?.has_ship_from}
                  onGenerateLabel={() => generateLabel(o.id)}
                  onMarkShipped={() => markShipped(o.id)}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function labelError(code: string | undefined): string | null {
  switch (code) {
    case "no_ship_from_address":
      return "Add your ship-from address above before generating a label.";
    case "no_shipping_address":
      return "This order has no buyer shipping address on file.";
    case "label_purchase_failed":
      return "The carrier rejected the label. Check the addresses and try again.";
    default:
      return null;
  }
}

function PayoutPanel({
  connect,
  loading,
  busy,
  onStart,
  onSaved,
}: {
  connect: ConnectStatus | null;
  loading: boolean;
  busy: boolean;
  onStart: () => void;
  onSaved: () => void;
}) {
  if (loading) {
    return (
      <div className="mt-4 border border-[#24282D] bg-[#0F1317] p-4 text-[12px] text-[#77808C]">
        Checking payout status…
      </div>
    );
  }

  if (connect && !connect.configured) {
    return (
      <div className="mt-4 border border-amber-800/40 bg-amber-950/30 p-4 text-[12px] text-amber-200">
        Payments aren&apos;t configured on this environment (missing Stripe key). Sales can&apos;t be
        processed until Stripe is set up.
      </div>
    );
  }

  const ready = connect?.ready;
  const hasShipFrom = connect?.has_ship_from;

  return (
    <div className="mt-4 border border-[#24282D] bg-[#0F1317] p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-[#77808C]">
          Seller payouts
        </div>
        <span
          className={`border px-2 py-0.5 text-[10px] uppercase tracking-wide ${
            ready
              ? "border-emerald-500/40 bg-emerald-900/20 text-emerald-300"
              : "border-amber-500/40 bg-amber-900/20 text-amber-300"
          }`}
        >
          {ready ? "Active" : "Action needed"}
        </span>
      </div>

      {!ready ? (
        <div className="mt-3">
          <p className="text-[12px] leading-relaxed text-[#B8C0CC]">
            Connect a Stripe account to receive money when your cards sell. Buyers pay
            CardzCheck; your sale amount (minus the platform fee) is deposited to your bank.
            Buyers can&apos;t check out on your listings until this is done.
          </p>
          <button
            onClick={onStart}
            disabled={busy}
            className="mt-3 border border-[#20B26B] bg-[#20B26B] px-3 py-1.5 text-[12px] font-semibold text-[#07100B] hover:bg-[#33C47C] disabled:opacity-50"
          >
            {busy ? "Redirecting to Stripe…" : "Set up payouts"}
          </button>
        </div>
      ) : (
        <div className="mt-3">
          <p className="text-[12px] text-emerald-300">
            ✓ Payouts active. You&apos;ll be paid automatically when a sale completes.
          </p>
          <ShipFromForm shipFrom={connect?.account?.ship_from ?? null} onSaved={onSaved} />
        </div>
      )}

      {!hasShipFrom && ready ? (
        <p className="mt-2 text-[11px] text-amber-300">
          Add your ship-from address so you can generate shipping labels.
        </p>
      ) : null}
    </div>
  );
}

function ShipFromForm({
  shipFrom,
  onSaved,
}: {
  shipFrom: ShipTo | null;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(!shipFrom);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: shipFrom?.name ?? "",
    phone: shipFrom?.phone ?? "",
    street1: shipFrom?.street1 ?? "",
    street2: shipFrom?.street2 ?? "",
    city: shipFrom?.city ?? "",
    state: shipFrom?.state ?? "",
    zip: shipFrom?.zip ?? "",
    country: shipFrom?.country ?? "US",
  });

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch("/api/marketplace/connect", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "save_failed");
      setOpen(false);
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "save_failed");
    } finally {
      setSaving(false);
    }
  }

  if (!open && shipFrom) {
    return (
      <div className="mt-3 flex items-center justify-between gap-3 border-t border-[#24282D] pt-3 text-[12px]">
        <div className="text-[#B8C0CC]">
          <span className="text-[#77808C]">Ships from:</span> {shipFrom.city}, {shipFrom.state}{" "}
          {shipFrom.zip}
        </div>
        <button
          onClick={() => setOpen(true)}
          className="text-[11px] text-[#77808C] underline hover:text-[#E6E8EB]"
        >
          Edit
        </button>
      </div>
    );
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const inputCls =
    "border border-[#24282D] bg-[#0B0D0F] px-2 py-1.5 text-[12px] text-[#E6E8EB] placeholder:text-[#5A626E] focus:border-[#5A626E] focus:outline-none";

  return (
    <div className="mt-3 border-t border-[#24282D] pt-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-[#77808C]">
        Ship-from address
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <input className={`${inputCls} col-span-2`} placeholder="Full name" value={form.name} onChange={set("name")} />
        <input className={`${inputCls} col-span-2`} placeholder="Street address" value={form.street1} onChange={set("street1")} />
        <input className={`${inputCls} col-span-2`} placeholder="Apt, suite (optional)" value={form.street2} onChange={set("street2")} />
        <input className={inputCls} placeholder="City" value={form.city} onChange={set("city")} />
        <input className={inputCls} placeholder="State (e.g. CA)" value={form.state} onChange={set("state")} />
        <input className={inputCls} placeholder="ZIP" value={form.zip} onChange={set("zip")} />
        <input className={inputCls} placeholder="Phone" value={form.phone} onChange={set("phone")} />
      </div>
      {err ? <div className="mt-2 text-[11px] text-red-300">{err}</div> : null}
      <div className="mt-2 flex gap-2">
        <button
          onClick={save}
          disabled={saving}
          className="border border-[#20B26B] bg-[#20B26B] px-3 py-1.5 text-[12px] font-semibold text-[#07100B] hover:bg-[#33C47C] disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save address"}
        </button>
        {shipFrom ? (
          <button
            onClick={() => setOpen(false)}
            className="border border-[#343941] bg-[#0F1317] px-3 py-1.5 text-[12px] text-[#B8C0CC] hover:border-[#5A626E]"
          >
            Cancel
          </button>
        ) : null}
      </div>
    </div>
  );
}

function OrderCard({
  order,
  busy,
  shipReady,
  onGenerateLabel,
  onMarkShipped,
}: {
  order: SellerOrder;
  busy: boolean;
  shipReady: boolean;
  onGenerateLabel: () => void;
  onMarkShipped: () => void;
}) {
  const card = order.listings.marketplace_cards;
  const platformFulfills = order.fulfilled_by === "platform";
  const st = order.ship_to;

  return (
    <div className="border border-[#24282D] bg-[#0F1317] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[14px] font-semibold text-[#E6E8EB]">
            {card.player} · {card.year}
          </div>
          <div className="mt-0.5 truncate text-[12px] text-[#B8C0CC]">
            {card.title} · {card.grading_service} {card.grade}
          </div>
        </div>
        <span
          className={`shrink-0 border px-2 py-0.5 text-[10px] uppercase tracking-wide ${
            STATUS_CHIP[order.fulfillment_status] ?? STATUS_CHIP.paid
          }`}
        >
          {STATUS_LABEL[order.fulfillment_status] ?? order.fulfillment_status}
        </span>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {/* Money */}
        <div className="border border-[#24282D] bg-[#0B0D0F] p-3 text-[12px]">
          <Row label="Sale price" value={money(order.sale_price_cents)} />
          <Row label="Shipping" value={money(order.shipping_cents)} />
          <Row label="Platform fee" value={`− ${money(order.fee_amount_cents)}`} muted />
          <div className="my-1 border-t border-[#24282D]" />
          <Row label="Your payout" value={money(order.seller_payout_cents)} strong />
        </div>

        {/* Ship to */}
        <div className="border border-[#24282D] bg-[#0B0D0F] p-3 text-[12px]">
          <div className="text-[10px] uppercase tracking-wide text-[#77808C]">Ship to</div>
          {st ? (
            <div className="mt-1 text-[#B8C0CC]">
              <div className="text-[#E6E8EB]">{st.name}</div>
              <div>{st.street1}</div>
              {st.street2 ? <div>{st.street2}</div> : null}
              <div>
                {st.city}, {st.state} {st.zip}
              </div>
            </div>
          ) : (
            <div className="mt-1 text-[#77808C]">No address captured.</div>
          )}
        </div>
      </div>

      {/* Tracking */}
      {order.tracking_number ? (
        <div className="mt-3 border border-[#24282D] bg-[#0B0D0F] p-3 text-[12px]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-[#B8C0CC]">
              <span className="text-[#77808C]">{order.carrier ?? "Carrier"} {order.service_level}</span>{" "}
              <span className="font-data">{order.tracking_number}</span>
            </div>
            <div className="flex gap-3">
              {order.tracking_url ? (
                <a
                  href={order.tracking_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-sky-300 underline"
                >
                  Track
                </a>
              ) : null}
              {order.label_url ? (
                <a
                  href={order.label_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-emerald-300 underline"
                >
                  Download label
                </a>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {/* Actions */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {platformFulfills ? (
          <span className="text-[11px] text-[#77808C]">
            CardzCheck is fulfilling this order from the vault.
          </span>
        ) : order.fulfillment_status === "paid" ? (
          <button
            onClick={onGenerateLabel}
            disabled={busy || !shipReady}
            title={!shipReady ? "Add your ship-from address first" : undefined}
            className="border border-[#20B26B] bg-[#20B26B] px-3 py-1.5 text-[12px] font-semibold text-[#07100B] hover:bg-[#33C47C] disabled:opacity-50"
          >
            {busy ? "Buying label…" : "Generate shipping label"}
          </button>
        ) : order.fulfillment_status === "label_created" ? (
          <button
            onClick={onMarkShipped}
            disabled={busy}
            className="border border-indigo-500/50 bg-indigo-900/30 px-3 py-1.5 text-[12px] font-semibold text-indigo-200 hover:bg-indigo-900/50 disabled:opacity-50"
          >
            {busy ? "Updating…" : "Mark as shipped"}
          </button>
        ) : order.fulfillment_status === "shipped" ? (
          <span className="text-[11px] text-indigo-300">In transit — awaiting buyer delivery confirmation.</span>
        ) : order.fulfillment_status === "delivered" ? (
          <span className="text-[11px] text-emerald-300">Delivered. Order complete.</span>
        ) : null}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  muted,
  strong,
}: {
  label: string;
  value: string;
  muted?: boolean;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-[#77808C]">{label}</span>
      <span
        className={`tabular-nums ${
          strong ? "font-semibold text-emerald-300" : muted ? "text-[#77808C]" : "text-[#E6E8EB]"
        }`}
      >
        {value}
      </span>
    </div>
  );
}
