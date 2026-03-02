"use client";

import { useState, useMemo, useCallback } from "react";
import Link from "next/link";
import type { BusinessInventoryItem, BusinessMetrics } from "@/types";
import type { InventoryValueSummary } from "@/lib/business/inventory-value";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const STALE_DAYS_THRESHOLD = 60;
const PRICE_DEVIATION_THRESHOLD = 1.15;

function fmt(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

// ——— Signal generation ———

interface ActionSignal {
  id: string;
  type: "list" | "reprice" | "sell_urgency";
  title: string;
  explanation: string;
  item: BusinessInventoryItem;
}

function generateActionSignals(
  items: BusinessInventoryItem[],
  now: Date = new Date()
): ActionSignal[] {
  const signals: ActionSignal[] = [];
  const nowMs = now.getTime();

  for (const item of items) {
    if (item.status === "sold" || item.status === "returned") continue;

    // Held 60+ days without listing
    if (item.status === "unlisted" && item.acquisition_date) {
      const ageMs = nowMs - Date.parse(item.acquisition_date);
      if (!Number.isNaN(ageMs)) {
        const ageDays = Math.floor(ageMs / MS_PER_DAY);
        if (ageDays >= STALE_DAYS_THRESHOLD) {
          signals.push({
            id: `stale-${item.id}`,
            type: "list",
            title: item.title,
            explanation: `Held ${ageDays} days unlisted — get this moving.`,
            item,
          });
        }
      }
    }

    const listPrice = item.list_price_cents;
    const cmv = item.current_market_value_cents;

    // Listed above CMV — market may have moved against you
    if (
      item.status === "listed" &&
      listPrice != null &&
      cmv != null &&
      cmv > 0 &&
      listPrice > cmv * PRICE_DEVIATION_THRESHOLD
    ) {
      signals.push({
        id: `sell-urgency-${item.id}`,
        type: "sell_urgency",
        title: item.title,
        explanation: `Listed at ${fmt(listPrice)} but CMV is ${fmt(cmv)} — consider a price cut.`,
        item,
      });
    }

    // CMV significantly above list price — reprice up opportunity
    if (
      listPrice != null &&
      cmv != null &&
      cmv > listPrice * PRICE_DEVIATION_THRESHOLD
    ) {
      signals.push({
        id: `reprice-${item.id}`,
        type: "reprice",
        title: item.title,
        explanation: `CMV is ${fmt(cmv)}, listed at ${fmt(listPrice)} — you may be leaving money on the table.`,
        item,
      });
    }
  }

  return signals.slice(0, 8);
}

// ——— Market pulse ———

interface MarketPulseItem {
  item: BusinessInventoryItem;
  trend: "up" | "down" | "neutral";
  ratio: number;
  totalCmv: number;
  cost: number;
}

function generateMarketPulse(items: BusinessInventoryItem[]): MarketPulseItem[] {
  const candidates: MarketPulseItem[] = [];

  for (const item of items) {
    if (item.status === "sold" || item.status === "returned") continue;
    if (!item.current_market_value_cents || item.current_market_value_cents <= 0) continue;
    if (!item.cost_basis_total_cents || item.cost_basis_total_cents <= 0) continue;

    const qty = item.quantity ?? 1;
    const totalCmv = item.current_market_value_cents * qty;
    const cost = item.cost_basis_total_cents;
    const ratio = totalCmv / cost;
    const trend: MarketPulseItem["trend"] =
      ratio > 1.05 ? "up" : ratio < 0.95 ? "down" : "neutral";

    candidates.push({ item, ratio, trend, totalCmv, cost });
  }

  candidates.sort((a, b) => b.ratio - a.ratio);

  // Surface top gainers + bottom performers
  const top = candidates.slice(0, 3);
  const bottom = candidates
    .slice(-3)
    .filter((c) => !top.some((t) => t.item.id === c.item.id));

  return [...top, ...bottom].slice(0, 6);
}

// ——— Skeleton ———

function Skeleton() {
  return <div className="h-5 w-20 bg-gray-800 rounded animate-pulse" />;
}

// ——— Props ———

interface Props {
  items: BusinessInventoryItem[];
  metrics: BusinessMetrics | null;
  metricsLoading: boolean;
  inventorySummary: InventoryValueSummary | null;
  onSelectItem: (item: BusinessInventoryItem) => void;
  onSwitchToInventory: () => void;
}

// ——— Component ———

export default function BusinessDashboard({
  items,
  metrics,
  metricsLoading,
  inventorySummary,
  onSelectItem,
  onSwitchToInventory,
}: Props) {
  const [analystPrompt, setAnalystPrompt] = useState("");
  const [analystLoading, setAnalystLoading] = useState(false);
  const [analystResponse, setAnalystResponse] = useState<string | null>(null);
  const [analystError, setAnalystError] = useState<string | null>(null);

  const activeItems = useMemo(
    () => items.filter((i) => i.status !== "sold" && i.status !== "returned"),
    [items]
  );
  const listedCount = useMemo(
    () => activeItems.filter((i) => i.status === "listed").length,
    [activeItems]
  );
  const unlistedCount = useMemo(
    () => activeItems.filter((i) => i.status === "unlisted").length,
    [activeItems]
  );

  const actionSignals = useMemo(() => generateActionSignals(items), [items]);
  const marketPulse = useMemo(() => generateMarketPulse(items), [items]);

  const handleAnalystSubmit = useCallback(async () => {
    const q = analystPrompt.trim();
    if (!q || analystLoading) return;
    setAnalystLoading(true);
    setAnalystResponse(null);
    setAnalystError(null);
    try {
      const res = await fetch("/api/business/consultant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: q }),
      });
      const data = await res.json();
      if (data.ok) {
        setAnalystResponse(data.response ?? "No response.");
      } else {
        setAnalystError(data.error ?? "Request failed.");
      }
    } catch {
      setAnalystError("Could not reach the analyst. Please try again.");
    } finally {
      setAnalystLoading(false);
    }
  }, [analystPrompt, analystLoading]);

  // Portfolio snapshot values
  const portfolioValue =
    inventorySummary != null
      ? inventorySummary.itemsWithCmv > 0
        ? inventorySummary.totalCmvCents
        : inventorySummary.totalCostCents
      : null;
  const portfolioLabel =
    inventorySummary?.itemsWithCmv ? "Portfolio CMV" : "Portfolio Cost";

  const sectionClass =
    "rounded-lg border border-gray-800 bg-gray-900/70 overflow-hidden";
  const sectionHeaderClass =
    "px-4 py-3 border-b border-gray-800 flex items-center justify-between";

  return (
    <div className="space-y-4">
      {/* ── 1. Portfolio Snapshot ─────────────────────────────────── */}
      <section>
        <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">
          Portfolio Snapshot
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {/* CMV */}
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-2.5">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">
              {portfolioLabel}
            </p>
            {metricsLoading ? (
              <Skeleton />
            ) : (
              <p className="text-base font-bold tabular-nums text-emerald-400">
                {portfolioValue != null ? fmt(portfolioValue) : "—"}
              </p>
            )}
          </div>

          {/* Active Listings */}
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-2.5">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">
              Active Listings
            </p>
            {metricsLoading ? (
              <Skeleton />
            ) : (
              <p className="text-base font-bold tabular-nums text-white">
                {listedCount}
              </p>
            )}
          </div>

          {/* Unlisted */}
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-2.5">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">
              Unlisted
            </p>
            {metricsLoading ? (
              <Skeleton />
            ) : (
              <p
                className={`text-base font-bold tabular-nums ${
                  unlistedCount > 0 ? "text-amber-400" : "text-white"
                }`}
              >
                {unlistedCount}
              </p>
            )}
          </div>

          {/* Revenue MTD */}
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-2.5">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">
              Revenue MTD
            </p>
            {metricsLoading ? (
              <Skeleton />
            ) : (
              <p className="text-base font-bold tabular-nums text-white">
                {metrics ? fmt(metrics.revenueMtd) : "—"}
              </p>
            )}
          </div>

          {/* Profit MTD */}
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-2.5">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">
              Profit MTD
            </p>
            {metricsLoading ? (
              <Skeleton />
            ) : (
              <p
                className={`text-base font-bold tabular-nums ${
                  metrics
                    ? metrics.profitMtd >= 0
                      ? "text-emerald-400"
                      : "text-red-400"
                    : "text-white"
                }`}
              >
                {metrics ? fmt(metrics.profitMtd) : "—"}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* ── 2. Today's Actions ────────────────────────────────────── */}
      <section className={sectionClass}>
        <div className={sectionHeaderClass}>
          <div>
            <h2 className="text-sm font-semibold text-white">
              Today's Actions
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Signals from your inventory — act on what matters today
            </p>
          </div>
          <span className="rounded border border-emerald-700/60 bg-emerald-900/30 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-emerald-300">
            AI
          </span>
        </div>

        <div className="divide-y divide-gray-800">
          {actionSignals.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-sm text-gray-400">
                No urgent signals right now.
              </p>
              <p className="text-xs text-gray-600 mt-1">
                Add inventory with acquisition dates and CMV to generate action
                signals.
              </p>
            </div>
          ) : (
            actionSignals.map((signal) => (
              <div
                key={signal.id}
                className="px-4 py-3 flex items-start justify-between gap-4"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <span
                    className={`mt-1.5 shrink-0 w-1.5 h-1.5 rounded-full ${
                      signal.type === "list"
                        ? "bg-amber-400"
                        : signal.type === "reprice"
                        ? "bg-blue-400"
                        : "bg-red-400"
                    }`}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white truncate">
                      {signal.title}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {signal.explanation}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {signal.type === "list" && (
                    <button
                      onClick={() => onSelectItem(signal.item)}
                      className="px-2.5 py-1 text-xs font-medium bg-amber-900/40 hover:bg-amber-900/70 text-amber-300 rounded transition-colors"
                    >
                      List
                    </button>
                  )}
                  {signal.type === "reprice" && (
                    <button
                      onClick={() => onSelectItem(signal.item)}
                      className="px-2.5 py-1 text-xs font-medium bg-blue-900/40 hover:bg-blue-900/70 text-blue-300 rounded transition-colors"
                    >
                      Reprice
                    </button>
                  )}
                  {signal.type === "sell_urgency" && (
                    <button
                      onClick={() => onSelectItem(signal.item)}
                      className="px-2.5 py-1 text-xs font-medium bg-red-900/40 hover:bg-red-900/70 text-red-300 rounded transition-colors"
                    >
                      Review
                    </button>
                  )}
                  <button
                    onClick={() => onSelectItem(signal.item)}
                    className="px-2.5 py-1 text-xs font-medium bg-gray-800 hover:bg-gray-700 text-gray-300 rounded transition-colors"
                  >
                    View
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {actionSignals.length > 0 && (
          <div className="px-4 py-2 border-t border-gray-800 text-right">
            <button
              onClick={onSwitchToInventory}
              className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
            >
              Go to Inventory →
            </button>
          </div>
        )}
      </section>

      {/* ── 3. Market Pulse ──────────────────────────────────────── */}
      <section className={sectionClass}>
        <div className={sectionHeaderClass}>
          <div>
            <h2 className="text-sm font-semibold text-white">Market Pulse</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              CMV vs cost basis — how your holdings are positioned
            </p>
          </div>
        </div>

        <div className="divide-y divide-gray-800">
          {marketPulse.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-sm text-gray-400">No CMV data yet.</p>
              <p className="text-xs text-gray-600 mt-1">
                Fetch CMV in the Inventory tab to see how your holdings are
                trending.
              </p>
            </div>
          ) : (
            marketPulse.map(({ item, trend, ratio, totalCmv, cost }) => (
              <button
                key={item.id}
                onClick={() => onSelectItem(item)}
                className="w-full px-4 py-3 flex items-center justify-between gap-4 hover:bg-gray-800/50 transition-colors text-left"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className={`text-base leading-none shrink-0 ${
                      trend === "up"
                        ? "text-emerald-400"
                        : trend === "down"
                        ? "text-red-400"
                        : "text-gray-500"
                    }`}
                  >
                    {trend === "up" ? "↑" : trend === "down" ? "↓" : "→"}
                  </span>
                  <p className="text-sm text-white truncate">{item.title}</p>
                </div>
                <div className="flex items-center gap-4 shrink-0 text-right">
                  <div>
                    <p className="text-[10px] text-gray-500 uppercase">CMV</p>
                    <p className="text-xs font-medium tabular-nums text-white">
                      {fmt(totalCmv)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-500 uppercase">Cost</p>
                    <p className="text-xs font-medium tabular-nums text-gray-400">
                      {fmt(cost)}
                    </p>
                  </div>
                  <div className="w-14 text-right">
                    <p className="text-[10px] text-gray-500 uppercase">
                      vs Cost
                    </p>
                    <p
                      className={`text-xs font-semibold tabular-nums ${
                        ratio > 1
                          ? "text-emerald-400"
                          : ratio < 1
                          ? "text-red-400"
                          : "text-gray-400"
                      }`}
                    >
                      {ratio > 1 ? "+" : ""}
                      {Math.round((ratio - 1) * 100)}%
                    </p>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </section>

      {/* ── 4. Analyst Shortcut ──────────────────────────────────── */}
      <section className={sectionClass}>
        <div className={sectionHeaderClass}>
          <div>
            <h2 className="text-sm font-semibold text-white">
              Ask the Analyst
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Quick question, inline answer
            </p>
          </div>
          <Link
            href="/business/consultant"
            className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
          >
            Full session →
          </Link>
        </div>

        <div className="p-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={analystPrompt}
              onChange={(e) => setAnalystPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleAnalystSubmit();
                }
              }}
              placeholder="Ask about your inventory, pricing, or strategy..."
              className="flex-1 bg-gray-950 border border-gray-700 rounded-md px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-emerald-600 transition-colors"
              disabled={analystLoading}
            />
            <button
              onClick={handleAnalystSubmit}
              disabled={analystLoading || !analystPrompt.trim()}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-md transition-colors shrink-0"
            >
              {analystLoading ? (
                <svg
                  className="w-4 h-4 animate-spin"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
              ) : (
                "Ask"
              )}
            </button>
          </div>

          {analystError && (
            <p className="mt-2 text-xs text-red-400">{analystError}</p>
          )}

          {analystResponse && (
            <div className="mt-3 rounded-md bg-gray-950 border border-gray-800 p-3">
              <p className="text-[10px] text-emerald-400 uppercase tracking-wider mb-2">
                Analyst
              </p>
              <div className="text-xs text-gray-300 leading-relaxed whitespace-pre-wrap">
                {analystResponse}
              </div>
              <div className="mt-2 pt-2 border-t border-gray-800 text-right">
                <Link
                  href="/business/consultant"
                  className="text-[10px] text-gray-500 hover:text-gray-400 transition-colors"
                >
                  Continue in full session →
                </Link>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
