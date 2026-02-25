"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import type { BusinessInventoryItem } from "@/types";

function fmtCents(cents: number | null): string {
  if (cents === null) return "";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

/** Placeholder text for empty/null values in ledger table */
function emptyPlaceholder(field: string): string {
  switch (field) {
    case "list_price_cents": return "Not listed";
    case "current_market_value_cents": return "No comps — click to set";
    case "location": return "Add storage";
    default: return "—";
  }
}

interface Props {
  items: BusinessInventoryItem[];
  /** Id of item currently open in detail drawer (for selected row highlight) */
  selectedItemId?: string | null;
  onItemClick: (item: BusinessInventoryItem) => void;
  onInlineUpdate: (id: string, field: string, value: any) => void;
  onBulkAction: (action: string, ids: string[], payload?: any) => void;
  onDelete: (ids: string[]) => void;
  /** Called when filtered items change so parent can display filter-aware inventory value */
  onFilteredChange?: (filtered: BusinessInventoryItem[]) => void;
  /** Tighter row padding (Business mode) */
  dense?: boolean;
}

const STATUS_OPTIONS = ["unlisted", "listed", "pending_sale", "sold", "returned"] as const;
const CHANNEL_OPTIONS = ["ebay", "whatnot", "instagram", "show", "local", "other"] as const;
const CONDITION_OPTIONS = ["raw", "graded"] as const;

export default function InventoryTable({
  items,
  selectedItemId = null,
  onItemClick,
  onInlineUpdate,
  onBulkAction,
  onDelete,
  onFilteredChange,
  dense = false,
}: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterChannel, setFilterChannel] = useState("");
  const [filterCondition, setFilterCondition] = useState("");
  const [activeTab, setActiveTab] = useState<"all" | "cards" | "wax">("all");
  const [editingCell, setEditingCell] = useState<{
    id: string;
    field: string;
  } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [bulkAction, setBulkAction] = useState("");
  const [bulkPayload, setBulkPayload] = useState("");
  const [fetchingCmvId, setFetchingCmvId] = useState<string | null>(null);

  const handleFetchCmv = async (item: BusinessInventoryItem) => {
    if (item.current_market_value_cents != null && item.current_market_value_cents > 0) return;
    if (!item.title?.trim()) return;
    setFetchingCmvId(item.id);
    try {
      const res = await fetch(
        `/api/business/inventory/fetch-cmv?item_id=${encodeURIComponent(item.id)}`
      );
      const data = await res.json().catch(() => null);
      const cmv = data?.cmv;
      if (typeof cmv === "number" && Number.isFinite(cmv) && cmv > 0) {
        const cents = Math.round(cmv * 100);
        onInlineUpdate(item.id, "current_market_value_cents", cents);
      }
    } finally {
      setFetchingCmvId(null);
    }
  };

  const isWax = (item: BusinessInventoryItem) =>
    Boolean(item.notes?.includes("[WAX]"));

  const waxCount = useMemo(() => items.filter(isWax).length, [items]);
  const cardCount = useMemo(() => items.filter((it) => !isWax(it)).length, [items]);

  const filtered = useMemo(() => {
    let result = items;

    // Tab filter
    if (activeTab === "wax") result = result.filter(isWax);
    else if (activeTab === "cards") result = result.filter((it) => !isWax(it));

    if (search) {
      const q = search.toLowerCase();
      result = result.filter((it) => it.title.toLowerCase().includes(q));
    }
    if (filterStatus) result = result.filter((it) => it.status === filterStatus);
    if (filterChannel) result = result.filter((it) => it.channel === filterChannel);
    if (filterCondition)
      result = result.filter((it) => it.condition_status === filterCondition);
    return result;
  }, [items, search, filterStatus, filterChannel, filterCondition, activeTab]);

  useEffect(() => {
    onFilteredChange?.(filtered);
  }, [filtered, onFilteredChange]);

  const toggleAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((it) => it.id)));
    }
  };

  const toggleOne = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const startEdit = (id: string, field: string, currentValue: any) => {
    setEditingCell({ id, field });
    setEditValue(currentValue?.toString() ?? "");
  };

  const commitEdit = () => {
    if (!editingCell) return;
    const { id, field } = editingCell;
    let value: any = editValue;
    if (field.endsWith("_cents")) {
      const parsed = Math.round(parseFloat(editValue) * 100);
      value = Number.isNaN(parsed) ? 0 : parsed;
    } else if (field === "quantity") {
      value = parseInt(editValue, 10) || 1;
    }
    onInlineUpdate(id, field, value);
    setEditingCell(null);
  };

  const handleBulkExecute = () => {
    const ids = Array.from(selected);
    if (!ids.length || !bulkAction) return;

    if (bulkAction === "delete") {
      onDelete(ids);
    } else {
      onBulkAction(bulkAction, ids, bulkPayload || undefined);
    }
    setSelected(new Set());
    setBulkAction("");
    setBulkPayload("");
  };

  const renderCell = (item: BusinessInventoryItem, field: string) => {
    const isEditing =
      editingCell?.id === item.id && editingCell?.field === field;

    if (isEditing) {
      if (field === "status") {
        return (
          <select
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={commitEdit}
            autoFocus
            className="w-full bg-gray-800 border border-emerald-500 rounded px-1 py-0.5 text-xs text-white"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        );
      }
      if (field === "channel") {
        return (
          <select
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={commitEdit}
            autoFocus
            className="w-full bg-gray-800 border border-emerald-500 rounded px-1 py-0.5 text-xs text-white"
          >
            {CHANNEL_OPTIONS.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        );
      }
      return (
        <input
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitEdit();
            if (e.key === "Escape") setEditingCell(null);
          }}
          autoFocus
          className="w-full bg-gray-800 border border-emerald-500 rounded px-1 py-0.5 text-xs text-white"
        />
      );
    }

    const val = (item as any)[field];
    if (field === "title") {
      const isWax = item.notes?.includes("[WAX]");
      const titleStr = val ?? "";
      const titleContent = (
        <>
          {isWax && (
            <span className="inline-flex items-center px-1 py-0.5 rounded text-[10px] font-semibold bg-amber-900/40 text-amber-400 whitespace-nowrap shrink-0">
              WAX
            </span>
          )}
          <span className="truncate" title={titleStr}>{titleStr}</span>
        </>
      );
      if (item.card_id) {
        return (
          <Link
            href={`/cards/${item.card_id}`}
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1.5 min-w-0 text-gray-300 hover:text-white hover:underline"
          >
            {titleContent}
          </Link>
        );
      }
      return (
        <span className="flex items-center gap-1.5 min-w-0">
          {titleContent}
        </span>
      );
    }
    if (field === "list_price_cents") {
      const formatted = fmtCents(val);
      if (!formatted) {
        return <span className="italic text-gray-500 text-xs">{emptyPlaceholder(field)}</span>;
      }
      return <span className="tabular-nums">{formatted}</span>;
    }
    if (field === "current_market_value_cents") {
      const formatted = fmtCents(val);
      const isEmpty = !formatted || val == null || val <= 0;
      if (isEmpty) {
        const isFetching = fetchingCmvId === item.id;
        return (
          <span
            className="flex items-center gap-1.5"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="italic text-gray-500 text-xs">
              {emptyPlaceholder(field)}
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleFetchCmv(item);
              }}
              disabled={isFetching || !item.title?.trim()}
              className="shrink-0 px-1.5 py-0.5 text-[10px] font-medium bg-gray-700 hover:bg-gray-600 disabled:opacity-50 rounded text-gray-300"
            >
              {isFetching ? "…" : "Get"}
            </button>
          </span>
        );
      }
      return <span className="tabular-nums">{formatted}</span>;
    }
    if (field === "_view") {
      if (!item.card_id) return null;
      return (
        <Link
          href={`/cards/${item.card_id}`}
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium text-blue-400 hover:text-blue-300 hover:underline rounded"
        >
          View
        </Link>
      );
    }
    if (field === "_grade") {
      if (!item.card_id) return null;
      return (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onItemClick(item);
          }}
          className="px-1.5 py-0.5 text-[10px] font-medium bg-blue-900/60 hover:bg-blue-800 text-blue-300 rounded"
        >
          Grade
        </button>
      );
    }
    if (field === "location") {
      const str = val?.toString()?.trim() || "";
      if (!str) {
        return <span className="italic text-gray-500 text-xs">{emptyPlaceholder(field)}</span>;
      }
      return str;
    }
    if (field.endsWith("_cents")) {
      return <span className="tabular-nums">{fmtCents(val)}</span>;
    }
    if (field === "acquisition_date" && val) return val;
    return val?.toString() ?? "—";
  };

  const statusColor = (status: string) => {
    switch (status) {
      case "sold": return "bg-emerald-900/50 text-emerald-400";
      case "listed": return "bg-blue-900/50 text-blue-400";
      case "pending_sale": return "bg-yellow-900/50 text-yellow-400";
      case "returned": return "bg-red-900/50 text-red-400";
      default: return "bg-gray-800 text-gray-400";
    }
  };

  const columns: { key: string; label: string; editable: boolean; width: string; alignRight?: boolean }[] = [
    { key: "title", label: "Title", editable: true, width: "min-w-[180px]" },
    { key: "quantity", label: "Qty", editable: true, width: "w-12 shrink-0" },
    { key: "cost_basis_total_cents", label: "Cost", editable: true, width: "w-20 shrink-0", alignRight: true },
    { key: "status", label: "Status", editable: true, width: "w-24 shrink-0" },
    { key: "channel", label: "Channel", editable: true, width: "w-20 shrink-0" },
    { key: "list_price_cents", label: "List $", editable: true, width: "w-20 shrink-0", alignRight: true },
    { key: "current_market_value_cents", label: "CMV", editable: true, width: "w-20 shrink-0", alignRight: true },
    { key: "location", label: "Storage", editable: true, width: "w-24 shrink-0" },
    { key: "acquisition_date", label: "Acquired", editable: true, width: "w-24 shrink-0" },
    { key: "_view", label: "Card", editable: false, width: "w-20 shrink-0" },
    { key: "_grade", label: "", editable: false, width: "w-16 shrink-0" },
  ];

  return (
    <div>
      {/* Tabs */}
      <div className="flex items-center gap-1 mb-2 border-b border-gray-800">
        {(
          [
            { id: "all", label: "All", count: items.length },
            { id: "cards", label: "Cards", count: cardCount },
            { id: "wax", label: "Wax", count: waxCount },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            onClick={() => {
              setActiveTab(tab.id);
              setSelected(new Set());
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border-b-2 -mb-px transition-colors ${
              activeTab === tab.id
                ? tab.id === "wax"
                  ? "border-amber-500 text-amber-400"
                  : "border-emerald-500 text-emerald-400"
                : "border-transparent text-gray-500 hover:text-gray-300"
            }`}
          >
            {tab.id === "wax" && (
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            )}
            {tab.id === "cards" && (
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
              </svg>
            )}
            {tab.label}
            <span
              className={`text-xs px-1.5 py-0.5 rounded-full ${
                activeTab === tab.id
                  ? tab.id === "wax"
                    ? "bg-amber-900/50 text-amber-300"
                    : "bg-emerald-900/50 text-emerald-300"
                  : "bg-gray-800 text-gray-500"
              }`}
            >
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 mb-3">
        {/* Search */}
        <div className="relative flex-1 w-full min-w-0">
          <div className="absolute inset-y-0 left-0 flex items-center pl-2.5 pointer-events-none">
            <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search inventory..."
            className="w-full pl-8 pr-2.5 py-1.5 bg-gray-900 border border-gray-800 rounded-md text-xs text-white placeholder-gray-500 focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
          />
        </div>

        {/* Filters */}
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-2.5 py-1.5 bg-gray-900 border border-gray-800 rounded-md text-xs text-white shrink-0"
        >
          <option value="">All Status</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        <select
          value={filterChannel}
          onChange={(e) => setFilterChannel(e.target.value)}
          className="px-2.5 py-1.5 bg-gray-900 border border-gray-800 rounded-md text-xs text-white shrink-0"
        >
          <option value="">All Channels</option>
          {CHANNEL_OPTIONS.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        <select
          value={filterCondition}
          onChange={(e) => setFilterCondition(e.target.value)}
          className="px-2.5 py-1.5 bg-gray-900 border border-gray-800 rounded-md text-xs text-white shrink-0"
        >
          <option value="">Raw & Graded</option>
          {CONDITION_OPTIONS.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {/* Bulk actions bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-2 mb-3 p-2 bg-emerald-900/20 border border-emerald-800 rounded-md">
          <span className="text-sm text-emerald-300 font-medium">
            {selected.size} selected
          </span>
          <select
            value={bulkAction}
            onChange={(e) => setBulkAction(e.target.value)}
            className="px-2 py-1 bg-gray-900 border border-gray-700 rounded text-sm text-white"
          >
            <option value="">Bulk action...</option>
            <option value="set_status">Set status</option>
            <option value="set_location">Set storage</option>
            <option value="delete">Delete</option>
          </select>
          {bulkAction === "set_status" && (
            <select
              value={bulkPayload}
              onChange={(e) => setBulkPayload(e.target.value)}
              className="px-2 py-1 bg-gray-900 border border-gray-700 rounded text-sm text-white"
            >
              <option value="">Choose status...</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          )}
          {bulkAction === "set_location" && (
            <input
              type="text"
              value={bulkPayload}
              onChange={(e) => setBulkPayload(e.target.value)}
              placeholder="Storage"
              className="px-2 py-1 bg-gray-900 border border-gray-700 rounded text-sm text-white"
            />
          )}
          <button
            onClick={handleBulkExecute}
            disabled={!bulkAction || (bulkAction !== "delete" && !bulkPayload)}
            className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm rounded font-medium"
          >
            Apply
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="px-3 py-1 text-gray-400 hover:text-white text-sm"
          >
            Clear
          </button>
        </div>
      )}

      {/* Table — ledger style: tight rows, right-align money */}
      <div className="overflow-x-auto border border-gray-800 rounded-lg">
        <table className="w-full text-xs text-left">
          <thead className="bg-gray-900 border-b border-gray-800">
            <tr>
              <th className={`w-8 shrink-0 ${dense ? "px-2 py-1" : "px-2 py-1.5"}`}>
                <input
                  type="checkbox"
                  checked={filtered.length > 0 && selected.size === filtered.length}
                  onChange={toggleAll}
                  className="rounded border-gray-600 text-emerald-500 focus:ring-emerald-500"
                />
              </th>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-2 ${dense ? "py-1" : "py-1.5"} text-[10px] font-medium text-gray-500 uppercase tracking-wider ${col.width} ${col.alignRight ? "text-right" : ""}`}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800/80">
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={columns.length + 1}
                  className="px-4 py-8 text-center text-xs text-gray-500"
                >
                  {activeTab === "wax"
                    ? "No wax / sealed products found. Use Add Wax to track boxes and cases."
                    : activeTab === "cards"
                    ? "No cards found. Use Add Inventory to add cards to your inventory."
                    : "No inventory items found."}
                </td>
              </tr>
            )}
            {filtered.map((item, idx) => (
              <tr
                key={item.id}
                className={`transition-colors cursor-pointer ${
                  selectedItemId === item.id
                    ? "bg-emerald-900/30 ring-inset"
                    : idx % 2 === 1
                    ? "bg-gray-900/30 hover:bg-gray-800/60"
                    : "hover:bg-gray-800/60"
                }`}
              >
                <td className={`px-2 ${dense ? "py-0.5" : "py-1"}`} onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selected.has(item.id)}
                    onChange={() => toggleOne(item.id)}
                    className="rounded border-gray-600 text-emerald-500 focus:ring-emerald-500"
                  />
                </td>
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`px-2 ${dense ? "py-0.5" : "py-1"} text-gray-300 ${col.width} ${col.alignRight ? "text-right tabular-nums" : ""}`}
                    onClick={() => {
                      if (col.editable) {
                        const val = (item as any)[col.key];
                        const displayVal = col.key.endsWith("_cents") && val !== null
                          ? (val / 100).toFixed(2)
                          : val;
                        startEdit(item.id, col.key, displayVal);
                      }
                    }}
                    onDoubleClick={() => onItemClick(item)}
                  >
                    {col.key === "status" ? (
                      editingCell?.id === item.id && editingCell?.field === "status" ? (
                        renderCell(item, col.key)
                      ) : (
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${statusColor(item.status)}`}
                        >
                          {item.status}
                        </span>
                      )
                    ) : (
                      renderCell(item, col.key)
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-1.5 text-[10px] text-gray-500">
        {filtered.length} item{filtered.length !== 1 ? "s" : ""}
        {filtered.length !== items.length && ` (of ${items.length} total)`}
        {" · Click cell to edit · Double-click row to open detail"}
      </div>
    </div>
  );
}
