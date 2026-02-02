"use client";

import { useRef, useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import CollectionGrid from "@/components/CollectionGrid";
import AuthenticatedLayout from "@/components/AuthenticatedLayout";
import PaywallModal from "@/components/PaywallModal";
import AddCardModalNew from "@/components/AddCardModalNew";
import CollectionSmartSearch from "@/components/CollectionSmartSearch";
import { createClient } from "@/lib/supabase/client";
import type { CollectionItem, User } from "@/types";
import { LIMITS } from "@/types";
import { isTestMode, getTestUser } from "@/lib/test-mode";
import { computeCollectionSummary, getEstCmv } from "@/lib/values";

function formatPrice(price: number | null): string {
  if (price === null) return "CMV unavailable";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(price);
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export default function CollectionPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [items, setItems] = useState<CollectionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPaywall, setShowPaywall] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showSmartSearch, setShowSmartSearch] = useState(false);
  const [toast, setToast] = useState<{type: 'success' | 'error', message: string} | null>(null);
  const [filterQuery, setFilterQuery] = useState("");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "player_az" | "player_za" | "paid_high" | "paid_low">("newest");
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Auto-dismiss toast after 3 seconds
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  useEffect(() => {
    async function loadData() {
      // In test mode, use mock user
      if (isTestMode()) {
        setUser(getTestUser());
        // Load collection (will return empty array in test mode)
        const response = await fetch("/api/collection");
        const data = await response.json();
        if (data.items) {
          setItems(data.items);
        }
        setLoading(false);
        console.log("🧪 TEST MODE: Using mock user in Collection");
        return;
      }

      const supabase = createClient();
      const { data: { user: authUser } } = await supabase.auth.getUser();

      if (!authUser) {
        router.push("/login?redirect=/collection");
        return;
      }

      // Load user data
      const { data: userData } = await supabase
        .from("users")
        .select("*")
        .eq("id", authUser.id)
        .single();

      if (userData) {
        setUser(userData);
      }

      // Load collection
      const response = await fetch("/api/collection");
      const data = await response.json();

      if (data.items) {
        setItems(data.items);
      }

      setLoading(false);
    }

    loadData();
  }, [router]);

  const handleDelete = async (id: string) => {
    const response = await fetch(`/api/collection?id=${id}`, {
      method: "DELETE",
    });

    if (response.ok) {
      setItems((prev) => prev.filter((item) => item.id !== id));
    }
  };

  const refreshCollection = async () => {
    const response = await fetch("/api/collection");
    const data = await response.json();
    if (data.items) {
      setItems(data.items);
    }
  };

  const csvEscape = (value: unknown): string => {
    if (value === null || value === undefined) return "";
    const str = String(value);
    if (/[",\n\r]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const exportCsv = () => {
    const headers = [
      "player_name",
      "year",
      "set_name",
      "grade",
      "est_cmv",
      "purchase_price",
      "purchase_date",
      "estimated_cmv",
      "cmv_confidence",
      "cmv_last_updated",
      "image_url",
      "notes",
    ];

    const rows = items.map((it) => [
      it.player_name,
      it.year,
      it.set_name,
      it.grade,
      it.est_cmv ?? "",
      it.purchase_price,
      it.purchase_date,
      it.estimated_cmv,
      it.cmv_confidence,
      it.cmv_last_updated,
      it.image_url,
      it.notes,
    ]);

    const csv = [
      headers.join(","),
      ...rows.map((r) => r.map(csvEscape).join(",")),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cardzcheck-collection-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const parseCsvLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          const next = line[i + 1];
          if (next === '"') {
            cur += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          cur += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === ",") {
          out.push(cur);
          cur = "";
        } else {
          cur += ch;
        }
      }
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };

  const importCsvText = async (text: string) => {
    const lines = text
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .split("\n")
      .filter((l) => l.trim().length > 0);

    if (lines.length < 2) {
      throw new Error("CSV must include a header row and at least one data row.");
    }

    const header = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
    const idx = (name: string) => header.indexOf(name);

    const iPlayer = idx("player_name");
    if (iPlayer === -1) {
      throw new Error('CSV header must include "player_name".');
    }

    const iYear = idx("year");
    const iSet = idx("set_name");
    const iGrade = idx("grade");
    const iPrice = idx("purchase_price");
    const iDate = idx("purchase_date");
    const iImage = idx("image_url");
    const iNotes = idx("notes");

    const toNull = (v: string | undefined) => (v && v.trim() ? v.trim() : null);
    const toNumberOrNull = (v: string | undefined) => {
      const raw = v?.trim();
      if (!raw) return null;
      const num = parseFloat(raw);
      if (Number.isNaN(num)) throw new Error(`Invalid purchase_price: "${raw}"`);
      return num;
    };

    const payload = lines.slice(1).map((line, rowIdx) => {
      const cols = parseCsvLine(line);
      const player_name = cols[iPlayer]?.trim();
      if (!player_name) {
        throw new Error(`Row ${rowIdx + 2}: player_name is required`);
      }
      return {
        player_name,
        year: iYear === -1 ? null : toNull(cols[iYear]),
        set_name: iSet === -1 ? null : toNull(cols[iSet]),
        grade: iGrade === -1 ? null : toNull(cols[iGrade]),
        purchase_price: iPrice === -1 ? null : toNumberOrNull(cols[iPrice]),
        purchase_date: iDate === -1 ? null : toNull(cols[iDate]),
        image_url: iImage === -1 ? null : toNull(cols[iImage]),
        notes: iNotes === -1 ? null : toNull(cols[iNotes]),
      };
    });

    setImporting(true);
    try {
      const response = await fetch("/api/collection/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: payload }),
      });
      const data = await response.json();

      if (!response.ok) {
        if (data?.error === "limit_reached") {
          setShowPaywall(true);
          return;
        }
        throw new Error(data?.error || "Import failed");
      }

      setToast({ type: "success", message: `Imported ${data.imported || payload.length} cards!` });
      await refreshCollection();
    } finally {
      setImporting(false);
    }
  };

  const handleImportFile = async (file: File | null) => {
    if (!file) return;
    try {
      const text = await file.text();
      await importCsvText(text);
    } catch (err) {
      setToast({ type: "error", message: err instanceof Error ? err.message : "Import failed" });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Collection calculations
  const collectionSummary = useMemo(() => computeCollectionSummary(items), [items]);

  // Top performers (cards with highest value)
  // Top performers (by % change using CMV vs cost basis where both exist)
  const topPerformers = useMemo(() => {
    return items
      .map((item) => {
        const est = getEstCmv(item);
        const cost = item.purchase_price ?? null;
        return { item, est, cost };
      })
      .filter(
        ({ est, cost }) =>
          est !== null &&
          cost !== null &&
          typeof cost === "number" &&
          cost > 0
      )
      .map(({ item, est, cost }) => {
        const dollarChange = est - cost;
        const pctChange = cost > 0 ? (dollarChange / cost) * 100 : 0;
        return { item, est, cost, dollarChange, pctChange };
      })
      .sort((a, b) => {
        if (b.pctChange !== a.pctChange) return b.pctChange - a.pctChange;
        return b.dollarChange - a.dollarChange;
      })
      .slice(0, 5)
      .map(({ item }) => item);
  }, [items]);

  // Recently added cards (last 5)
  const recentlyAdded = useMemo(() => {
    return [...items]
      .sort((a, b) => {
        const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return dateB - dateA;
      })
      .slice(0, 5);
  }, [items]);

  const collectionCount = items.length;
  const collectionLimit = user?.is_paid
    ? null
    : LIMITS.FREE_COLLECTION;
  const isNearLimit = !user?.is_paid && collectionLimit !== null && collectionCount >= collectionLimit - 1;


  const visibleItems = useMemo(() => {
    const q = (filterQuery || searchQuery).trim().toLowerCase();
    let filtered = items;

    if (q) {
      filtered = items.filter((it) => {
        const hay = [
          it.player_name,
          it.year,
          it.set_name,
          it.grade,
          it.notes,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
    }

    const byDateDesc = (a: CollectionItem, b: CollectionItem) =>
      (b.created_at || "").localeCompare(a.created_at || "");
    const byDateAsc = (a: CollectionItem, b: CollectionItem) =>
      (a.created_at || "").localeCompare(b.created_at || "");
    const byPlayerAsc = (a: CollectionItem, b: CollectionItem) =>
      (a.player_name || "").localeCompare(b.player_name || "");
    const byPlayerDesc = (a: CollectionItem, b: CollectionItem) =>
      (b.player_name || "").localeCompare(a.player_name || "");
    const byPaidDesc = (a: CollectionItem, b: CollectionItem) =>
      (b.purchase_price || 0) - (a.purchase_price || 0);
    const byPaidAsc = (a: CollectionItem, b: CollectionItem) =>
      (a.purchase_price || 0) - (b.purchase_price || 0);

    const sorted = [...filtered];
    switch (sortBy) {
      case "oldest":
        sorted.sort(byDateAsc);
        break;
      case "player_az":
        sorted.sort(byPlayerAsc);
        break;
      case "player_za":
        sorted.sort(byPlayerDesc);
        break;
      case "paid_high":
        sorted.sort(byPaidDesc);
        break;
      case "paid_low":
        sorted.sort(byPaidAsc);
        break;
      case "newest":
      default:
        sorted.sort(byDateDesc);
        break;
    }
    return sorted;
  }, [items, filterQuery, searchQuery, sortBy]);

  return (
    <AuthenticatedLayout>
      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                Your Collection
              </h1>
              <p className="text-gray-500 dark:text-gray-400 mt-1">
                Track performance and manage your investment
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => handleImportFile(e.target.files?.[0] || null)}
              />
              <button
                onClick={exportCsv}
                disabled={items.length === 0}
                className="px-4 py-2 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Export CSV
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={importing}
                className="px-4 py-2 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {importing ? "Importing..." : "Import CSV"}
              </button>
              <button
                onClick={() => setShowAddModal(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Card
              </button>
            </div>
          </div>
        </div>

        {/* Hero Collection Stats */}
        <div className="bg-gradient-to-br from-blue-600 to-blue-700 dark:from-blue-700 dark:to-blue-800 rounded-2xl p-6 mb-6 text-white">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {/* Total Value - Hero */}
            <div className="md:col-span-2">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                <p className="text-blue-100 text-sm font-medium uppercase tracking-wider">Collection Value</p>
              </div>
              <p className="text-4xl font-bold tabular-nums">
                {formatPrice(collectionSummary.totalDisplayValue)}
              </p>
              {collectionSummary.cardsWithCmv === 0 && collectionSummary.cardCount > 0 && (
                <p className="text-xs text-blue-100/80 mt-1">
                  Collection value is estimated CMV only. Add comps to get values.
                </p>
              )}
              <p className="text-blue-100 text-sm mt-2">{collectionCount} cards in collection</p>
            </div>
            {/* Cost Basis */}
            <div className="bg-white/10 rounded-xl p-4">
              <p className="text-blue-200 text-xs font-medium uppercase tracking-wider mb-1">Cost Basis</p>
              <p className="text-2xl font-bold tabular-nums">
                {formatPrice(collectionSummary.totalCostBasis)}
              </p>
            </div>
            {/* Unrealized P/L */}
            <div className="bg-white/10 rounded-xl p-4">
              <p className="text-blue-200 text-xs font-medium uppercase tracking-wider mb-1">Unrealized P/L</p>
              {collectionSummary.totalUnrealizedPL !== null &&
              collectionSummary.totalUnrealizedPLPct !== null ? (
                <>
                  <p
                    className={`text-2xl font-bold tabular-nums ${
                      collectionSummary.totalUnrealizedPL >= 0
                        ? "text-green-300"
                        : "text-red-300"
                    }`}
                  >
                    {collectionSummary.totalUnrealizedPL >= 0 ? "+" : ""}
                    {formatPrice(collectionSummary.totalUnrealizedPL)}
                  </p>
                  <p
                    className={`text-xs ${
                      collectionSummary.totalUnrealizedPLPct >= 0
                        ? "text-green-300"
                        : "text-red-300"
                    }`}
                  >
                    {collectionSummary.totalUnrealizedPLPct >= 0 ? "+" : ""}
                    {(collectionSummary.totalUnrealizedPLPct * 100).toFixed(1)}%
                  </p>
                </>
              ) : (
                <div className="space-y-1">
                  <p className="text-2xl font-bold tabular-nums text-blue-100">—</p>
                  <p className="text-xs text-blue-100/80">
                    Market value unavailable for cost-basis comparison.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Collection Limit Indicator for Free Users */}
        {user && !user.is_paid && collectionLimit !== null && (
          <div className={`mb-6 p-4 rounded-xl border ${
            isNearLimit
              ? "bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800"
              : "bg-gray-100 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700"
          }`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  Collection Limit
                </p>
                <p className="text-lg font-bold text-gray-900 dark:text-white mt-1">
                  {collectionCount} / {collectionLimit} cards
                </p>
              </div>
              {isNearLimit && (
                <button
                  onClick={() => setShowPaywall(true)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm"
                >
                  Upgrade to Pro
                </button>
              )}
            </div>
            {isNearLimit && (
              <p className="text-sm text-yellow-800 dark:text-yellow-200 mt-2">
                You're near your collection limit. Upgrade to Pro for unlimited cards.
              </p>
            )}
          </div>
        )}

        {/* Top Performers & Recently Added */}
        {!loading && items.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            {/* Top Performers */}
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Top Performers</h2>
              </div>
              {topPerformers.length > 0 ? (
                <div className="space-y-3">
                  {topPerformers.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        {item.image_url && (
                          <img
                            src={item.image_url}
                            alt={item.player_name}
                            className="w-10 h-14 object-cover rounded"
                          />
                        )}
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white text-sm">
                            {item.player_name}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {item.year} {item.set_name}
                          </p>
                        </div>
                      </div>
                      <p className="font-semibold text-gray-900 dark:text-white">
                        {formatPrice(item.estimated_cmv)}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  CMV unavailable. Add comps to calculate top values.
                </p>
              )}
            </div>

            {/* Recently Added */}
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Recently Added</h2>
              </div>
              {recentlyAdded.length > 0 ? (
                <div className="space-y-3">
                  {recentlyAdded.map((item) => {
                    const estCmv = getEstCmv(item);
                    return (
                      <div
                        key={item.id}
                        className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          {item.image_url && (
                            <img
                              src={item.image_url}
                              alt={item.player_name}
                              className="w-10 h-14 object-cover rounded"
                            />
                          )}
                          <div>
                            <p className="font-medium text-gray-900 dark:text-white text-sm">
                              {item.player_name}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {item.year} {item.set_name}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                              {estCmv != null && estCmv > 0 ? (
                                <>
                                  <span className="font-medium">
                                    CMV: {formatPrice(estCmv)}
                                  </span>
                                  {item.purchase_price != null && (
                                    <span className="ml-1 text-[11px] text-gray-400">
                                      (Paid {formatPrice(item.purchase_price)})
                                    </span>
                                  )}
                                </>
                              ) : item.purchase_price != null ? (
                                <>
                                  <span className="font-medium">
                                    Value: {formatPrice(item.purchase_price)}
                                  </span>
                                  <span className="ml-1 text-[11px] text-gray-400">
                                    Market value unavailable
                                  </span>
                                </>
                              ) : (
                                <span className="text-[11px] text-gray-400">
                                  Market value unavailable
                                </span>
                              )}
                            </p>
                          </div>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {item.created_at
                            ? new Date(item.created_at).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                              })
                            : "-"}
                        </p>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  No cards added yet.
                </p>
              )}
            </div>
          </div>
        )}

        {/* All Cards Section Header */}
        {!loading && items.length > 0 && (
          <div className="mb-4 space-y-3">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">All Cards</h2>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                Showing {visibleItems.length} of {items.length}
              </span>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                  <svg
                    className="w-5 h-5 text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                </div>
                <input
                  type="text"
                  value={filterQuery}
                  onChange={(e) => {
                    setFilterQuery(e.target.value);
                    setSearchQuery(e.target.value);
                  }}
                  placeholder="Search your collection... (e.g., Jordan 1986 PSA 10)"
                  className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="sm:w-56 px-4 py-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="newest">Sort: Newest</option>
                <option value="oldest">Sort: Oldest</option>
                <option value="player_az">Sort: Player A–Z</option>
                <option value="player_za">Sort: Player Z–A</option>
                <option value="paid_high">Sort: Paid High→Low</option>
                <option value="paid_low">Sort: Paid Low→High</option>
              </select>
            </div>
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div
                key={i}
                className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden"
              >
                <div className="aspect-[3/4] bg-gray-200 dark:bg-gray-800 animate-pulse" />
                <div className="p-4 space-y-2">
                  <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded animate-pulse" />
                  <div className="h-3 bg-gray-200 dark:bg-gray-800 rounded w-2/3 animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <CollectionGrid
            items={visibleItems}
            onDelete={handleDelete}
            onRefresh={refreshCollection}
          />
        )}

        {/* Paywall Modal */}
        <PaywallModal
          isOpen={showPaywall}
          onClose={() => setShowPaywall(false)}
          type="collection"
        />

        {/* Add Card Modal (New - Upload/Manual) */}
        <AddCardModalNew
          isOpen={showAddModal}
          onClose={() => setShowAddModal(false)}
          onSuccess={(playerName, item) => {
            setToast({ type: 'success', message: `Added ${playerName} to collection!` });
            if (isTestMode() && item) {
              setItems((prev) => [item, ...prev]);
            } else {
              refreshCollection();
            }
          }}
          onLimitReached={() => setShowPaywall(true)}
          onOpenSmartSearch={() => {
            // Close the current Add Card modal and open the smart search flow instead
            setShowAddModal(false);
            setShowSmartSearch(true);
          }}
        />

        {/* Smart Search Add (same smart search UX as watchlist, but adds to collection) */}
        <CollectionSmartSearch
          isOpen={showSmartSearch}
          onClose={() => {
            setShowSmartSearch(false);
          }}
          onSuccess={(playerName, item) => {
            setToast({ type: 'success', message: `Added ${playerName} to collection!` });
            if (isTestMode() && item) {
              setItems((prev) => [item, ...prev]);
            } else {
              refreshCollection();
            }
            setShowSmartSearch(false);
          }}
          onLimitReached={() => {
            setShowSmartSearch(false);
            setShowPaywall(true);
          }}
        />

        {/* Toast Notification */}
        {toast && (
          <div
            className={`fixed bottom-4 right-4 p-4 rounded-lg shadow-lg z-50 flex items-center gap-3 ${
              toast.type === 'success'
                ? 'bg-green-600 text-white'
                : 'bg-red-600 text-white'
            }`}
          >
            {toast.type === 'success' ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
            <span>{toast.message}</span>
            <button
              onClick={() => setToast(null)}
              className="ml-2 hover:opacity-75"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
      </main>
    </AuthenticatedLayout>
  );
}
