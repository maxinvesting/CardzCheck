"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import {
  computePositionVsFloor,
  estimateTakeHome,
  fmtCents,
  fmtPct,
} from "@/lib/business/pricing";

// ── Types ────────────────────────────────────────────────────────────

interface ProfileItem {
  id: string;
  title?: string | null;
  player_name?: string | null;
  year?: string | null;
  set_name?: string | null;
  grade?: string | null;
  grading_company?: string | null;
  cert_number?: string | null;
  parallel_type?: string | null;
  insert?: string | null;
  quantity?: number | null;
  status?: string | null;
  channel?: string | null;
  condition_status?: string | null;
  list_price_cents?: number | null;
  cost_basis_total_cents?: number | null;
  current_market_value_cents?: number | null;
  acquisition_date?: string | null;
  purchase_price?: number | null;
  purchase_date?: string | null;
  notes?: string | null;
  image_url?: string | null;
  user_image_url?: string | null;
  stock_image_url?: string | null;
  ebay_image_url?: string | null;
  created_at?: string | null;
}

interface ProfileSale {
  id: string;
  sale_date: string;
  sale_price_cents: number;
  platform_fees_cents?: number;
  shipping_charged_cents?: number;
  shipping_paid_cents?: number;
  net_proceeds_cents?: number;
  profit_cents?: number;
  order_id?: string | null;
  notes?: string | null;
  // Fields from new business_sales schema
  channel?: string | null;
  sold_price_cents?: number;
  net_payout_cents?: number;
  sold_at?: string | null;
}

type Mode = "business" | "collection";

// ── Helpers ──────────────────────────────────────────────────────────

function pickImageUrl(item: ProfileItem): string | null {
  return (
    item.user_image_url ||
    item.stock_image_url ||
    item.ebay_image_url ||
    item.image_url ||
    null
  );
}

function displayTitle(item: ProfileItem): string {
  if (item.title) return item.title;
  const parts = [item.year, item.player_name, item.set_name, item.grade];
  return parts.filter(Boolean).join(" ") || "Untitled";
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

function statusBadge(status: string | null | undefined) {
  const s = (status ?? "").toLowerCase();
  const colors: Record<string, string> = {
    sold: "bg-emerald-900/50 text-emerald-400",
    listed: "bg-blue-900/50 text-blue-400",
    pending_sale: "bg-yellow-900/50 text-yellow-400",
    returned: "bg-red-900/50 text-red-400",
    unlisted: "bg-gray-800 text-gray-400",
  };
  return colors[s] || "bg-gray-800 text-gray-400";
}

function severityBadge(severity: string) {
  switch (severity) {
    case "low":
      return "bg-emerald-900/50 text-emerald-400";
    case "at":
      return "bg-blue-900/50 text-blue-400";
    case "above":
      return "bg-yellow-900/50 text-yellow-400";
    case "well-above":
      return "bg-red-900/50 text-red-400";
    default:
      return "bg-gray-800 text-gray-400";
  }
}

// ── Page Component ───────────────────────────────────────────────────

export default function CardProfilePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const itemId = params.itemId as string;
  const from = (searchParams.get("from") as Mode) || "collection";
  const isBusinessMode = from === "business";

  // Data state
  const [item, setItem] = useState<ProfileItem | null>(null);
  const [sales, setSales] = useState<ProfileSale[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Image zoom
  const [imageZoom, setImageZoom] = useState(false);

  // Update Price modal
  const [showPriceModal, setShowPriceModal] = useState(false);
  const [newPrice, setNewPrice] = useState("");
  const [updatingPrice, setUpdatingPrice] = useState(false);

  // Mark Sold modal
  const [showSoldModal, setShowSoldModal] = useState(false);
  const [soldForm, setSoldForm] = useState({
    sale_price: "",
    channel: "ebay",
    sale_date: new Date().toISOString().slice(0, 10),
  });
  const [recordingSale, setRecordingSale] = useState(false);

  // Toast
  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  // ── Data Loading ─────────────────────────────────────────────────

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/card-profile/${itemId}?from=${from}`,
        { cache: "no-store" }
      );
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      if (res.status === 404) {
        setError("Item not found");
        return;
      }
      if (!res.ok) {
        setError("Failed to load profile");
        return;
      }
      const data = await res.json();
      setItem(data.item);
      setSales(data.sales ?? []);
    } catch {
      setError("Failed to load profile");
    } finally {
      setLoading(false);
    }
  }, [itemId, from, router]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  // ── Derived State ────────────────────────────────────────────────

  const imageUrl = item ? pickImageUrl(item) : null;
  const title = item ? displayTitle(item) : "";

  const position = useMemo(() => {
    if (!item) return null;
    return computePositionVsFloor(
      item.list_price_cents,
      item.current_market_value_cents
    );
  }, [item]);

  const takeHome = useMemo(() => {
    if (!item) return [];
    return estimateTakeHome(item.list_price_cents);
  }, [item]);

  // Chart data: sales over time
  const chartData = useMemo(() => {
    if (sales.length === 0) return [];
    return sales
      .slice()
      .sort(
        (a, b) =>
          new Date(a.sale_date || a.sold_at || "").getTime() -
          new Date(b.sale_date || b.sold_at || "").getTime()
      )
      .map((s) => ({
        date: fmtDate(s.sale_date || s.sold_at),
        price: ((s.sale_price_cents ?? s.sold_price_cents ?? 0) / 100),
      }));
  }, [sales]);

  // ── Actions ──────────────────────────────────────────────────────

  const handleUpdatePrice = async () => {
    if (!item || updatingPrice) return;
    const parsed = parseFloat(newPrice);
    if (isNaN(parsed) || parsed < 0) return;
    const cents = Math.round(parsed * 100);

    setUpdatingPrice(true);
    try {
      const res = await fetch("/api/business/inventory", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, list_price_cents: cents }),
      });
      if (res.ok) {
        const updated = await res.json();
        setItem((prev) =>
          prev
            ? { ...prev, list_price_cents: updated.list_price_cents ?? cents }
            : prev
        );
        setShowPriceModal(false);
        setNewPrice("");
        setToast({ type: "success", message: "Price updated" });
      } else {
        setToast({ type: "error", message: "Failed to update price" });
      }
    } catch {
      setToast({ type: "error", message: "Failed to update price" });
    } finally {
      setUpdatingPrice(false);
    }
  };

  const handleMarkSold = async () => {
    if (!item || recordingSale) return;
    const priceParsed = parseFloat(soldForm.sale_price);
    if (isNaN(priceParsed) || priceParsed <= 0) return;
    const priceCents = Math.round(priceParsed * 100);

    setRecordingSale(true);
    try {
      const res = await fetch("/api/business/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inventory_item_id: item.id,
          sale_price_cents: priceCents,
          channel: soldForm.channel,
          sale_date: soldForm.sale_date,
          platform_fees_cents: 0,
          shipping_charged_cents: 0,
          shipping_paid_cents: 0,
          other_costs_cents: 0,
        }),
      });
      if (res.ok) {
        const sale = await res.json();
        setSales((prev) => [sale, ...prev]);
        setItem((prev) => (prev ? { ...prev, status: "sold" } : prev));
        setShowSoldModal(false);
        setSoldForm({
          sale_price: "",
          channel: "ebay",
          sale_date: new Date().toISOString().slice(0, 10),
        });
        setToast({ type: "success", message: "Sale recorded" });
      } else {
        setToast({ type: "error", message: "Failed to record sale" });
      }
    } catch {
      setToast({ type: "error", message: "Failed to record sale" });
    } finally {
      setRecordingSale(false);
    }
  };

  // ── Render: Loading / Error ──────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 text-white">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="animate-pulse space-y-6">
            <div className="h-6 w-40 bg-gray-800 rounded" />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="aspect-[3/4] bg-gray-800 rounded-xl" />
              <div className="space-y-4">
                <div className="h-24 bg-gray-800 rounded-xl" />
                <div className="h-40 bg-gray-800 rounded-xl" />
                <div className="h-32 bg-gray-800 rounded-xl" />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !item) {
    return (
      <div className="min-h-screen bg-gray-950 text-white">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
            <h2 className="text-xl font-semibold mb-2">
              {error || "Item not found"}
            </h2>
            <button
              onClick={() =>
                router.push(isBusinessMode ? "/business" : "/collection")
              }
              className="mt-4 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium"
            >
              {isBusinessMode ? "Back to Inventory" : "Back to Collection"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const costCents =
    item.cost_basis_total_cents ??
    (item.purchase_price != null ? Math.round(item.purchase_price * 100) : null);

  // ── Render: Profile ──────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Back link */}
        <button
          onClick={() =>
            router.push(isBusinessMode ? "/business" : "/collection")
          }
          className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-4 text-sm"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
          {isBusinessMode ? "Back to Inventory" : "Back to Collection"}
        </button>

        {/* Title row */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <h1 className="text-2xl font-bold">{title}</h1>
          {item.status && (
            <span
              className={`px-2 py-0.5 rounded text-xs font-medium ${statusBadge(
                item.status
              )}`}
            >
              {item.status}
            </span>
          )}
        </div>

        {/* ── Two-column layout ─────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* LEFT PANEL: Image + Key Facts + Actions */}
          <div className="lg:col-span-2 space-y-4">
            {/* Image */}
            <div
              className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden cursor-pointer"
              onClick={() => imageUrl && setImageZoom(true)}
            >
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt={title}
                  className="w-full aspect-[3/4] object-contain bg-gray-900 hover:scale-105 transition-transform duration-200"
                />
              ) : (
                <div className="w-full aspect-[3/4] flex flex-col items-center justify-center text-gray-600">
                  <svg
                    className="w-20 h-20 mb-2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1}
                      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                  <p className="text-sm">No image available</p>
                </div>
              )}
            </div>

            {/* Key Facts */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-2">
              <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">
                Key Facts
              </h3>
              <Fact label="Grade" value={item.grade} />
              <Fact
                label="Condition"
                value={item.condition_status}
              />
              <Fact label="Grader" value={item.grading_company} />
              <Fact label="Cert #" value={item.cert_number} />
              <Fact label="Parallel" value={item.parallel_type} />
              <Fact label="Insert" value={item.insert} />
              <Fact label="Year" value={item.year} />
              <Fact label="Set" value={item.set_name} />
              <Fact
                label="Qty"
                value={String(item.quantity ?? 1)}
              />
              <Fact
                label="Acquired"
                value={fmtDate(
                  item.acquisition_date ?? item.purchase_date
                )}
              />
              {item.notes && <Fact label="Notes" value={item.notes} />}
            </div>

            {/* Quick Actions */}
            {isBusinessMode && (
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setNewPrice(
                      item.list_price_cents != null
                        ? (item.list_price_cents / 100).toFixed(2)
                        : ""
                    );
                    setShowPriceModal(true);
                  }}
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Update Price
                </button>
                {item.status !== "sold" && (
                  <button
                    onClick={() => setShowSoldModal(true)}
                    className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    Mark Sold
                  </button>
                )}
              </div>
            )}
            {!isBusinessMode && (
              <div className="flex gap-2">
                <Link
                  href={`/cards/${item.id}`}
                  className="flex-1 text-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Edit Details
                </Link>
              </div>
            )}
          </div>

          {/* RIGHT PANELS */}
          <div className="lg:col-span-3 space-y-4">
            {/* 1) Pricing Panel */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-4">
                Pricing
              </h3>
              <div className="grid grid-cols-2 gap-4">
                {/* Market Floor / CMV */}
                <div>
                  <p className="text-xs text-gray-500 mb-1">
                    {isBusinessMode ? "Market Floor (CMV)" : "Est. Market Value"}
                  </p>
                  <p className="text-xl font-bold tabular-nums">
                    {fmtCents(item.current_market_value_cents)}
                  </p>
                </div>

                {/* List Price / Cost Basis */}
                {isBusinessMode ? (
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Your List Price</p>
                    <p className="text-xl font-bold tabular-nums">
                      {fmtCents(item.list_price_cents)}
                    </p>
                  </div>
                ) : (
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Cost Basis</p>
                    <p className="text-xl font-bold tabular-nums">
                      {item.purchase_price != null
                        ? fmtCents(Math.round(item.purchase_price * 100))
                        : "—"}
                    </p>
                  </div>
                )}
              </div>

              {/* Position vs Floor (business only) */}
              {isBusinessMode && position && (
                <div className="mt-4 pt-4 border-t border-gray-800">
                  <p className="text-xs text-gray-500 mb-1">
                    Position vs Floor
                  </p>
                  <div className="flex items-center gap-3">
                    <span className="text-lg font-semibold tabular-nums">
                      {position.diffCents >= 0 ? "+" : ""}
                      {fmtCents(position.diffCents)}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-medium ${severityBadge(
                        position.severity
                      )}`}
                    >
                      {fmtPct(position.diffPct)}
                    </span>
                  </div>
                </div>
              )}

              {/* Take-Home Estimates (business only) */}
              {isBusinessMode && takeHome.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-800">
                  <p className="text-xs text-gray-500 mb-2">
                    Est. Take-Home at List Price
                  </p>
                  <div className="space-y-1.5">
                    {takeHome.map((th) => (
                      <div
                        key={th.channel}
                        className="flex items-center justify-between text-sm"
                      >
                        <span className="text-gray-400 capitalize">
                          {th.channel}{" "}
                          <span className="text-xs text-gray-600">
                            ({(th.feeRate * 100).toFixed(1)}% fee)
                          </span>
                        </span>
                        <span className="font-medium tabular-nums">
                          {fmtCents(th.netCents)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Cost / Profit summary */}
              {costCents != null && costCents > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-800">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-400">Cost Basis</span>
                    <span className="font-medium tabular-nums">
                      {fmtCents(costCents)}
                    </span>
                  </div>
                  {item.current_market_value_cents != null &&
                    item.current_market_value_cents > 0 && (
                      <div className="flex items-center justify-between text-sm mt-1">
                        <span className="text-gray-400">Unrealized P/L</span>
                        {(() => {
                          const qty = item.quantity ?? 1;
                          const cmvTotal =
                            (item.current_market_value_cents ?? 0) * qty;
                          const diff = cmvTotal - costCents;
                          const pct =
                            costCents > 0 ? (diff / costCents) * 100 : 0;
                          return (
                            <span
                              className={`font-medium tabular-nums ${
                                diff >= 0
                                  ? "text-emerald-400"
                                  : "text-red-400"
                              }`}
                            >
                              {diff >= 0 ? "+" : ""}
                              {fmtCents(diff)}{" "}
                              <span className="text-xs">
                                ({fmtPct(pct)})
                              </span>
                            </span>
                          );
                        })()}
                      </div>
                    )}
                </div>
              )}
            </div>

            {/* 2) Chart Panel */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-4">
                Price History
              </h3>
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={chartData}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="#374151"
                    />
                    <XAxis
                      dataKey="date"
                      tick={{ fill: "#9CA3AF", fontSize: 11 }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: "#9CA3AF", fontSize: 11 }}
                      tickLine={false}
                      tickFormatter={(v: number) => `$${v}`}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#1F2937",
                        border: "1px solid #374151",
                        borderRadius: 8,
                        color: "#fff",
                      }}
                      formatter={(value: number | undefined) => [
                        value != null ? `$${value.toFixed(2)}` : "—",
                        "Sale Price",
                      ]}
                    />
                    <Line
                      type="monotone"
                      dataKey="price"
                      stroke="#10B981"
                      strokeWidth={2}
                      dot={{ fill: "#10B981", r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex flex-col items-center justify-center h-[200px] text-gray-600">
                  <svg
                    className="w-10 h-10 mb-2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1}
                      d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z"
                    />
                  </svg>
                  <p className="text-sm">
                    Chart available after we collect more data
                  </p>
                </div>
              )}
            </div>

            {/* 3) Activity Panel */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-4">
                Activity
              </h3>

              {/* Sales History */}
              {sales.length > 0 ? (
                <div>
                  <p className="text-xs text-gray-500 mb-2">Sales</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-gray-500 border-b border-gray-800">
                          <th className="pb-2 font-medium">Date</th>
                          <th className="pb-2 font-medium">Channel</th>
                          <th className="pb-2 font-medium text-right">
                            Gross
                          </th>
                          <th className="pb-2 font-medium text-right">
                            Net
                          </th>
                          <th className="pb-2 font-medium text-right">
                            Profit
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-800/60">
                        {sales.map((s) => (
                          <tr key={s.id}>
                            <td className="py-2 text-gray-300">
                              {fmtDate(s.sale_date || s.sold_at)}
                            </td>
                            <td className="py-2 text-gray-400 capitalize">
                              {s.channel ?? "—"}
                            </td>
                            <td className="py-2 text-right tabular-nums text-gray-300">
                              {fmtCents(
                                s.sale_price_cents ?? s.sold_price_cents
                              )}
                            </td>
                            <td className="py-2 text-right tabular-nums text-gray-300">
                              {fmtCents(
                                s.net_proceeds_cents ?? s.net_payout_cents
                              )}
                            </td>
                            <td
                              className={`py-2 text-right tabular-nums font-medium ${
                                (s.profit_cents ?? 0) >= 0
                                  ? "text-emerald-400"
                                  : "text-red-400"
                              }`}
                            >
                              {fmtCents(s.profit_cents)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : isBusinessMode ? (
                <p className="text-sm text-gray-600">
                  No sales recorded for this item.
                </p>
              ) : null}

              {/* Inventory Events */}
              <div
                className={
                  sales.length > 0
                    ? "mt-4 pt-4 border-t border-gray-800"
                    : ""
                }
              >
                <p className="text-xs text-gray-500 mb-2">Timeline</p>
                <div className="space-y-2">
                  {item.created_at && (
                    <TimelineEntry
                      date={item.created_at}
                      label="Added to collection"
                    />
                  )}
                  {(item.acquisition_date || item.purchase_date) && (
                    <TimelineEntry
                      date={
                        (item.acquisition_date ?? item.purchase_date)!
                      }
                      label="Acquired"
                    />
                  )}
                  {item.status === "sold" && sales[0] && (
                    <TimelineEntry
                      date={sales[0].sale_date || sales[0].sold_at || ""}
                      label={`Sold for ${fmtCents(
                        sales[0].sale_price_cents ??
                          sales[0].sold_price_cents
                      )}`}
                    />
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Image Zoom Modal ──────────────────────────────────────── */}
      {imageZoom && imageUrl && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setImageZoom(false)}
        >
          <img
            src={imageUrl}
            alt={title}
            className="max-w-full max-h-[90vh] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={() => setImageZoom(false)}
            className="absolute top-4 right-4 p-2 bg-gray-900/80 hover:bg-gray-800 rounded-full text-white"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      )}

      {/* ── Update Price Modal ────────────────────────────────────── */}
      {showPriceModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-sm">
            <h3 className="text-lg font-semibold mb-4">Update List Price</h3>
            <div className="mb-4">
              <label className="block text-sm text-gray-400 mb-1">
                New Price ($)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={newPrice}
                onChange={(e) => setNewPrice(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleUpdatePrice();
                }}
                autoFocus
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowPriceModal(false)}
                className="flex-1 px-4 py-2 border border-gray-700 rounded-lg text-gray-300 hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdatePrice}
                disabled={updatingPrice}
                className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg font-medium"
              >
                {updatingPrice ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Mark Sold Modal ───────────────────────────────────────── */}
      {showSoldModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-sm">
            <h3 className="text-lg font-semibold mb-4">Mark Sold</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Sold Price ($) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={soldForm.sale_price}
                  onChange={(e) =>
                    setSoldForm((f) => ({
                      ...f,
                      sale_price: e.target.value,
                    }))
                  }
                  autoFocus
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Channel
                </label>
                <select
                  value={soldForm.channel}
                  onChange={(e) =>
                    setSoldForm((f) => ({
                      ...f,
                      channel: e.target.value,
                    }))
                  }
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
                >
                  <option value="ebay">eBay</option>
                  <option value="whatnot">Whatnot</option>
                  <option value="instagram">Instagram</option>
                  <option value="show">Show</option>
                  <option value="local">Local</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Sold Date
                </label>
                <input
                  type="date"
                  value={soldForm.sale_date}
                  onChange={(e) =>
                    setSoldForm((f) => ({
                      ...f,
                      sale_date: e.target.value,
                    }))
                  }
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setShowSoldModal(false)}
                className="flex-1 px-4 py-2 border border-gray-700 rounded-lg text-gray-300 hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={handleMarkSold}
                disabled={recordingSale || !soldForm.sale_price}
                className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg font-medium"
              >
                {recordingSale ? "Recording..." : "Record Sale"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast ─────────────────────────────────────────────────── */}
      {toast && (
        <div
          className={`fixed bottom-4 right-4 p-4 rounded-lg shadow-lg z-50 flex items-center gap-3 ${
            toast.type === "success"
              ? "bg-emerald-600 text-white"
              : "bg-red-600 text-white"
          }`}
        >
          <span>{toast.message}</span>
          <button
            onClick={() => setToast(null)}
            className="hover:opacity-75"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────

function Fact({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  if (!value) return null;
  return (
    <div className="flex justify-between text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="text-gray-200 text-right max-w-[60%] truncate">
        {value}
      </span>
    </div>
  );
}

function TimelineEntry({
  date,
  label,
}: {
  date: string;
  label: string;
}) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <div className="w-2 h-2 rounded-full bg-gray-600 shrink-0" />
      <span className="text-gray-400">{fmtDate(date)}</span>
      <span className="text-gray-300">{label}</span>
    </div>
  );
}
