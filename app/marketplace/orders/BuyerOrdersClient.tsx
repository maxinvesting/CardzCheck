"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

interface BuyerOrder {
  id: string;
  sale_price_cents: number;
  shipping_cents: number;
  fulfillment_status: "paid" | "label_created" | "shipped" | "delivered" | "canceled";
  carrier: string | null;
  service_level: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  completed_at: string;
  listings: {
    marketplace_cards: {
      title: string;
      player: string;
      year: number;
      grade: string;
      grading_service: string;
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
  paid: "Paid · awaiting label",
  label_created: "Seller printing label",
  shipped: "Shipped",
  delivered: "Delivered",
  canceled: "Canceled",
};

export default function BuyerOrdersClient() {
  const [orders, setOrders] = useState<BuyerOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/marketplace/orders?role=buyer", { cache: "no-store" });
      const body = await res.json();
      setOrders((body.orders ?? []) as BuyerOrder[]);
    } catch {
      setError("Failed to load purchases.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function confirmDelivery(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/marketplace/orders/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "confirm_delivery" }),
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
      <div className="mx-auto max-w-4xl px-4 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-[#77808C]">
              Marketplace
            </div>
            <h1 className="mt-0.5 text-[20px] font-semibold">My purchases</h1>
          </div>
          <div className="flex gap-2">
            <Link
              href="/marketplace"
              className="border border-[#343941] bg-[#0F1317] px-3 py-1.5 text-[12px] text-[#B8C0CC] hover:border-[#5A626E] hover:text-[#E6E8EB]"
            >
              Browse
            </Link>
            <Link
              href="/marketplace/sell/orders"
              className="border border-[#343941] bg-[#0F1317] px-3 py-1.5 text-[12px] text-[#B8C0CC] hover:border-[#5A626E] hover:text-[#E6E8EB]"
            >
              My sales
            </Link>
          </div>
        </div>

        {error ? (
          <div className="mt-4 border border-red-800/50 bg-red-950/40 p-3 text-[12px] text-red-200">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="mt-6 border border-dashed border-[#24282D] bg-[#0B0D0F] p-8 text-center text-[12px] text-[#77808C]">
            Loading…
          </div>
        ) : orders.length === 0 ? (
          <div className="mt-6 border border-dashed border-[#24282D] bg-[#0B0D0F] p-8 text-center text-[12px] text-[#77808C]">
            You haven&apos;t bought anything yet.{" "}
            <Link href="/marketplace" className="text-emerald-400 hover:underline">
              Browse the exchange
            </Link>
            .
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            {orders.map((o) => {
              const card = o.listings.marketplace_cards;
              return (
                <div key={o.id} className="border border-[#24282D] bg-[#0F1317] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-[14px] font-semibold">
                        {card.player} · {card.year}
                      </div>
                      <div className="mt-0.5 truncate text-[12px] text-[#B8C0CC]">
                        {card.title} · {card.grading_service} {card.grade}
                      </div>
                    </div>
                    <span
                      className={`shrink-0 border px-2 py-0.5 text-[10px] uppercase tracking-wide ${
                        STATUS_CHIP[o.fulfillment_status] ?? STATUS_CHIP.paid
                      }`}
                    >
                      {STATUS_LABEL[o.fulfillment_status] ?? o.fulfillment_status}
                    </span>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[12px]">
                    <div className="text-[#B8C0CC]">
                      Paid {money(o.sale_price_cents + o.shipping_cents)}{" "}
                      <span className="text-[#77808C]">
                        ({money(o.sale_price_cents)} + {money(o.shipping_cents)} shipping)
                      </span>
                    </div>
                    {o.tracking_number ? (
                      <div className="text-[#B8C0CC]">
                        <span className="text-[#77808C]">
                          {o.carrier ?? "Carrier"} {o.service_level}
                        </span>{" "}
                        {o.tracking_url ? (
                          <a
                            href={o.tracking_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sky-300 underline"
                          >
                            {o.tracking_number}
                          </a>
                        ) : (
                          <span className="font-data">{o.tracking_number}</span>
                        )}
                      </div>
                    ) : null}
                  </div>

                  {o.fulfillment_status === "shipped" ? (
                    <div className="mt-3">
                      <button
                        onClick={() => confirmDelivery(o.id)}
                        disabled={busyId === o.id}
                        className="border border-[#20B26B] bg-[#20B26B] px-3 py-1.5 text-[12px] font-semibold text-[#07100B] hover:bg-[#33C47C] disabled:opacity-50"
                      >
                        {busyId === o.id ? "Confirming…" : "Confirm delivery"}
                      </button>
                    </div>
                  ) : o.fulfillment_status === "delivered" ? (
                    <div className="mt-3 text-[11px] text-emerald-300">
                      Delivered. Thanks for your purchase!
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
