"use client";

import {
  useState,
  useMemo,
  useEffect,
  useRef,
  forwardRef,
  type ComponentPropsWithoutRef,
} from "react";
import Link from "next/link";
import { TableVirtuoso } from "react-virtuoso";
import type { BusinessInventoryItem } from "@/types";
import {
  setPerfInteraction,
  activatePerfBucket,
  deactivatePerfBucket,
  recordDomMetrics,
} from "@/lib/dev/perf";
import EbayListingBadge from "./EbayListingBadge";
import EbayListingModal from "./EbayListingModal";
import { buildEbaySoldUrl } from "@/lib/ebay/comps-url";
import InventoryCardGrid from "./InventoryCardGrid";
import InventoryScrollView from "./InventoryScrollView";

function fmtCents(cents: number | null): string {
  if (cents === null) return "";
  return USD_FORMATTER.format(cents / 100);
}

/** Placeholder text for empty/null values in ledger table */
function emptyPlaceholder(field: string): string {
  switch (field) {
    case "list_price_cents": return "Not listed";
    case "current_market_value_cents": return "No estimate — click to set";
    case "location": return "Add storage";
    default: return "—";
  }
}

const GRADER_GRADE_PATTERN = /^(PSA|BGS|SGC|CGC)\s*(\d+(?:\.\d+)?)$/i;
const GRADER_PATTERN = /\b(PSA|BGS|SGC|CGC)\b/i;
const WHOLE_GRADE_PATTERN = /^\d+(?:\.0)?$/;
const HALF_GRADE_PATTERN = /^\d+\.5$/;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function inferGradingCompany(gradeValue: string): string | null {
  if (HALF_GRADE_PATTERN.test(gradeValue)) return "BGS";
  if (WHOLE_GRADE_PATTERN.test(gradeValue)) return "PSA";
  return null;
}

function buildDisplayTitle(item: BusinessInventoryItem): string {
  const baseTitle = (item.title || "").trim();
  if (!baseTitle) return baseTitle;

  const rawGrade = item.grade?.trim() || "";
  const rawGrader = item.grading_company?.trim() || "";
  if (!rawGrade && !rawGrader) return baseTitle;
  if (item.condition_status === "raw" || rawGrade.toLowerCase() === "raw") return baseTitle;

  const parsed = rawGrade.match(GRADER_GRADE_PATTERN);
  const parsedGrader = parsed?.[1]?.toUpperCase();
  const parsedGrade = parsed?.[2];
  const gradeValue = parsedGrade || rawGrade;
  const grader = rawGrader
    ? rawGrader.toUpperCase()
    : parsedGrader || inferGradingCompany(gradeValue);
  const gradeLabel = [grader, gradeValue].filter(Boolean).join(" ").trim();
  if (!gradeLabel) return baseTitle;

  if (new RegExp(`\\b${escapeRegExp(gradeLabel)}\\b`, "i").test(baseTitle)) {
    return baseTitle;
  }

  if (gradeValue && grader && !GRADER_PATTERN.test(baseTitle)) {
    const trailingGradePattern = new RegExp(`\\b${escapeRegExp(gradeValue)}\\s*$`, "i");
    if (trailingGradePattern.test(baseTitle)) {
      return baseTitle.replace(trailingGradePattern, gradeLabel);
    }
  }

  return `${baseTitle} ${gradeLabel}`.replace(/\s+/g, " ").trim();
}

interface Props {
  items: BusinessInventoryItem[];
  /** Id of item currently open in detail drawer (for selected row highlight) */
  selectedItemId?: string | null;
  onItemClick: (item: BusinessInventoryItem) => void;
  onInlineUpdate: (id: string, field: string, value: any) => void;
  onBulkAction: (action: string, ids: string[], payload?: any) => void;
  onDelete: (ids: string[]) => void;
  onMarkSold?: (item: BusinessInventoryItem) => void;
  /** Called when filtered items change so parent can display filter-aware inventory value */
  onFilteredChange?: (filtered: BusinessInventoryItem[]) => void;
  /** Tighter row padding (Business mode) */
  dense?: boolean;
  /** Enables dev-only perf instrumentation output */
  perfEnabled?: boolean;
  /** Whether the connected eBay account is Top Rated Plus (affects fee preview) */
  ebayTopRated?: boolean;
  /** Whether an active eBay account is connected — gates the List eBay button */
  ebayConnected?: boolean;
}

const STATUS_OPTIONS = ["unlisted", "listed", "pending_sale", "sold", "returned"] as const;
const ACTIVE_STATUS_OPTIONS = ["unlisted", "listed", "pending_sale"] as const;
const CHANNEL_OPTIONS = ["ebay", "whatnot", "instagram", "show", "local", "other"] as const;
const CONDITION_OPTIONS = ["raw", "graded"] as const;
const VIRTUALIZE_THRESHOLD = 200;

const USD_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
});

type ColumnDef = {
  key: string;
  label: string;
  editable: boolean;
  width: string;
  alignRight?: boolean;
  sortable?: boolean;
};

function getDaysHeld(acquisitionDate: string | null | undefined): number | null {
  if (!acquisitionDate) return null;
  const acq = new Date(acquisitionDate);
  if (isNaN(acq.getTime())) return null;
  const now = new Date();
  return Math.floor((now.getTime() - acq.getTime()) / (1000 * 60 * 60 * 24));
}

function getDaysHeldColor(days: number | null): string {
  if (days === null) return "text-[var(--biz-muted)]";
  if (days < 30) return "text-emerald-700";
  if (days <= 60) return "text-amber-700";
  return "text-red-600";
}

const COLUMNS: ColumnDef[] = [
  { key: "title", label: "Title", editable: true, width: "min-w-[180px]" },
  {
    key: "quantity",
    label: "Qty",
    editable: true,
    width: "w-12 shrink-0",
    sortable: true,
  },
  {
    key: "cost_basis_total_cents",
    label: "Cost",
    editable: true,
    width: "w-20 shrink-0",
    alignRight: true,
    sortable: true,
  },
  { key: "status", label: "Status", editable: true, width: "w-24 shrink-0" },
  {
    key: "channel",
    label: "Channel",
    editable: true,
    width: "w-20 shrink-0",
  },
  {
    key: "list_price_cents",
    label: "List $",
    editable: true,
    width: "w-20 shrink-0",
    alignRight: true,
    sortable: true,
  },
  {
    key: "current_market_value_cents",
    label: "Est. MV",
    editable: true,
    width: "w-20 shrink-0",
    alignRight: true,
    sortable: true,
  },
  { key: "_days_held", label: "Days Held", editable: false, width: "w-18 shrink-0" },
  { key: "location", label: "Storage", editable: true, width: "w-24 shrink-0" },
  {
    key: "acquisition_date",
    label: "Acquired",
    editable: true,
    width: "w-24 shrink-0",
  },
  { key: "_view", label: "Profile", editable: false, width: "w-20 shrink-0" },
  { key: "_grade", label: "", editable: false, width: "w-16 shrink-0" },
  { key: "_actions", label: "", editable: false, width: "w-20 shrink-0" },
];

const VirtuosoScroller = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<"div">
>(({ className, ...props }, ref) => (
  <div
    {...props}
    ref={ref}
    className={`overflow-auto ${className ?? ""}`.trim()}
  />
));
VirtuosoScroller.displayName = "VirtuosoScroller";

type SortableColumnKey =
  | "quantity"
  | "cost_basis_total_cents"
  | "list_price_cents"
  | "current_market_value_cents";

type SortDirection = "desc" | "asc";

export default function InventoryTable({
  items,
  selectedItemId = null,
  onItemClick,
  onInlineUpdate,
  onBulkAction,
  onDelete,
  onMarkSold,
  onFilteredChange,
  dense = false,
  perfEnabled = false,
  ebayTopRated = false,
  ebayConnected = false,
}: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  // Default to "active" so marking an item sold moves it out of the inventory view
  // and into the Sales tab.
  const [filterStatus, setFilterStatus] = useState<"active" | "all" | BusinessInventoryItem["status"]>("active");
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
  const [ebayListingItem, setEbayListingItem] = useState<BusinessInventoryItem | null>(null);
  const [sortKey, setSortKey] = useState<SortableColumnKey | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const tableContainerRef = useRef<HTMLDivElement | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "scroll" | "table">(() => {
    if (typeof window === "undefined") return "grid";
    const stored = window.localStorage.getItem("biz_inventory_view");
    return (stored === "grid" || stored === "scroll" || stored === "table") ? stored : "grid";
  });

  useEffect(() => {
    window.localStorage.setItem("biz_inventory_view", viewMode);
  }, [viewMode]);

  const handleFetchCmv = async (item: BusinessInventoryItem) => {
    if (item.current_market_value_cents != null && item.current_market_value_cents > 0) return;
    if (!item.title?.trim()) return;
    if (perfEnabled) {
      setPerfInteraction("market-floor");
      activatePerfBucket("market-floor");
    }
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
      if (perfEnabled) {
        window.setTimeout(() => {
          deactivatePerfBucket("market-floor", { itemId: item.id });
        }, 350);
      }
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
      result = result.filter((it) =>
        (it.title || "").toLowerCase().includes(q) ||
        buildDisplayTitle(it).toLowerCase().includes(q)
      );
    }
    if (filterStatus === "active") {
      result = result.filter((it) => ACTIVE_STATUS_OPTIONS.includes(it.status as any));
    } else if (filterStatus !== "all") {
      result = result.filter((it) => it.status === filterStatus);
    }
    if (filterChannel) result = result.filter((it) => it.channel === filterChannel);
    if (filterCondition)
      result = result.filter((it) => it.condition_status === filterCondition);
    return result;
  }, [items, search, filterStatus, filterChannel, filterCondition, activeTab]);

  const sortedItems = useMemo(() => {
    if (!sortKey) return filtered;

    const toSortableNumber = (value: unknown): number | null => {
      if (typeof value !== "number" || !Number.isFinite(value)) return null;
      return value;
    };

    const withIndex = filtered.map((item, index) => ({ item, index }));

    withIndex.sort((a, b) => {
      const aValue = toSortableNumber((a.item as any)[sortKey]);
      const bValue = toSortableNumber((b.item as any)[sortKey]);
      const aMissing = aValue === null;
      const bMissing = bValue === null;

      // Keep missing values at the bottom for both directions.
      if (aMissing && bMissing) return a.index - b.index;
      if (aMissing) return 1;
      if (bMissing) return -1;

      if (aValue === bValue) return a.index - b.index;
      if (sortDirection === "desc") return bValue - aValue;
      return aValue - bValue;
    });

    return withIndex.map((entry) => entry.item);
  }, [filtered, sortKey, sortDirection]);

  useEffect(() => {
    onFilteredChange?.(sortedItems);
  }, [sortedItems, onFilteredChange]);

  useEffect(() => {
    if (!perfEnabled || !tableContainerRef.current) return;
    const domNodeCount = tableContainerRef.current.querySelectorAll("*").length;
    recordDomMetrics(filtered.length, domNodeCount, {
      totalItems: items.length,
    });
  }, [filtered.length, items.length, perfEnabled]);

  const toggleAll = () => {
    if (selected.size === sortedItems.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(sortedItems.map((it) => it.id)));
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

  const commitEdit = (overrideValue?: string) => {
    if (!editingCell) return;
    const { id, field } = editingCell;
    const nextValue = overrideValue ?? editValue;
    let value: any = nextValue;
    if (field.endsWith("_cents")) {
      const parsed = Math.round(parseFloat(nextValue) * 100);
      value = Number.isNaN(parsed) ? 0 : parsed;
    } else if (field === "quantity") {
      value = parseInt(nextValue, 10) || 1;
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
            onChange={(e) => {
              const next = e.target.value;
              setEditValue(next);
              commitEdit(next);
            }}
            onBlur={() => setEditingCell(null)}
            onClick={(e) => e.stopPropagation()}
            autoFocus
            className="w-full rounded border border-[var(--biz-border)] bg-white px-2 py-1 text-xs text-[var(--biz-text)]"
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
            onChange={(e) => {
              const next = e.target.value;
              setEditValue(next);
              commitEdit(next);
            }}
            onBlur={() => setEditingCell(null)}
            onClick={(e) => e.stopPropagation()}
            autoFocus
            className="w-full rounded border border-[var(--biz-border)] bg-white px-2 py-1 text-xs text-[var(--biz-text)]"
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
          onBlur={() => commitEdit()}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitEdit();
            if (e.key === "Escape") setEditingCell(null);
          }}
          autoFocus
          className="w-full rounded border border-[var(--biz-border)] bg-white px-2 py-1 text-xs text-[var(--biz-text)]"
        />
      );
    }

    const val = (item as any)[field];
    if (field === "title") {
      const isWax = item.notes?.includes("[WAX]");
      const titleStr = buildDisplayTitle(item);
      const titleContent = (
        <>
          {isWax && (
            <span className="inline-flex shrink-0 items-center rounded border border-amber-200 bg-amber-50 px-1 py-0.5 text-[10px] font-semibold whitespace-nowrap text-amber-700">
              WAX
            </span>
          )}
          <span className="truncate" title={titleStr}>{titleStr}</span>
        </>
      );
      return (
        <Link
          href={`/card/${item.id}?from=business`}
          onClick={(e) => e.stopPropagation()}
          className="flex min-w-0 items-center gap-1.5 text-[var(--biz-text)] hover:underline"
        >
          {titleContent}
        </Link>
      );
    }
    if (field === "list_price_cents") {
      const formatted = fmtCents(val);
      if (!formatted) {
        return <span className="italic text-[var(--biz-muted)] text-xs">{emptyPlaceholder(field)}</span>;
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
            <span className="italic text-[var(--biz-muted)] text-xs">
              {emptyPlaceholder(field)}
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleFetchCmv(item);
              }}
              disabled={isFetching || !item.title?.trim()}
              className="shrink-0 rounded border border-[var(--biz-border)] bg-[#F9FAFB] px-1.5 py-0.5 text-[10px] font-medium text-[var(--biz-text)] hover:bg-[#F3F4F6] disabled:opacity-50"
            >
              {isFetching ? "…" : "Get"}
            </button>
          </span>
        );
      }
      return <span className="tabular-nums">{formatted}</span>;
    }
    if (field === "_days_held") {
      const days = getDaysHeld(item.acquisition_date);
      const color = getDaysHeldColor(days);
      return (
        <span className={`text-xs font-medium tabular-nums ${color}`} title={days !== null ? `${days} days since acquisition` : "No acquisition date"}>
          {days !== null ? `${days}d` : "—"}
        </span>
      );
    }
    if (field === "_view") {
      return (
        <Link
          href={`/card/${item.id}?from=business`}
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-[var(--biz-primary)] hover:underline"
        >
          Profile
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
          className="rounded border border-[var(--biz-border)] bg-[#F9FAFB] px-1.5 py-0.5 text-[10px] font-medium text-[var(--biz-primary)] hover:bg-[#F3F4F6]"
        >
          Grade
        </button>
      );
    }
    if (field === "_actions") {
      if (item.status === "sold") {
        return <span className="text-[10px] text-[var(--biz-muted)]">Recorded</span>;
      }
      const hasEbayListing = !!(item as any).ebay_item_id;
      // status === "sold" already handled by early return above; only check remaining terminal states
      const canListOnEbay =
        ebayConnected &&
        !hasEbayListing &&
        item.status !== "returned" &&
        item.status !== "pending_sale";
      const compsUrl = buildEbaySoldUrl({
        title: item.title,
        grade: item.grade,
        gradingCompany: item.grading_company,
      });
      return (
        <div className="flex flex-col items-start gap-1">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onMarkSold?.(item);
            }}
            className="rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 hover:bg-emerald-100"
          >
            Mark Sold
          </button>
          {canListOnEbay && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setEbayListingItem(item);
              }}
              className="rounded border border-[var(--biz-border)] bg-[#F9FAFB] px-2 py-0.5 text-[10px] font-medium text-[var(--biz-primary)] hover:bg-[#F3F4F6]"
            >
              List eBay
            </button>
          )}
          <a
            href={compsUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="rounded border border-[var(--biz-border)] bg-[#F9FAFB] px-2 py-0.5 text-[10px] font-medium text-[var(--biz-primary)] hover:bg-[#F3F4F6] transition-colors"
          >
            Get Comps
          </a>
        </div>
      );
    }
    if (field === "location") {
      const str = val?.toString()?.trim() || "";
      if (!str) {
        return <span className="italic text-[var(--biz-muted)] text-xs">{emptyPlaceholder(field)}</span>;
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
      case "sold": return "border border-emerald-200 bg-emerald-50 text-emerald-700";
      case "listed": return "border border-blue-200 bg-blue-50 text-blue-700";
      case "pending_sale": return "border border-amber-200 bg-amber-50 text-amber-700";
      case "returned": return "border border-red-200 bg-red-50 text-red-700";
      default: return "border border-[var(--biz-border)] bg-[#F9FAFB] text-[var(--biz-muted)]";
    }
  };

  const channelBadge = (channel: string, item?: BusinessInventoryItem) => {
    const ebayItemId = item ? (item as any).ebay_item_id as string | null : null;
    if (channel === "ebay") {
      return (
        <div className="flex flex-col gap-0.5">
          <span className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M6.26 8.68c-1.04 0-2.08.37-2.08 1.63 0 .74.48 1.27 1.2 1.27.99 0 1.68-.87 1.74-1.93l.03-.97h-.89zm2.79 3.3h-1.8l.03-.72h-.03c-.56.6-1.32.88-2.12.88C3.63 12.14 2.7 11.19 2.7 9.97c0-1.92 1.64-2.49 3.2-2.49h1.2V7.2c0-.7-.54-1.08-1.39-1.08-.65 0-1.35.24-1.87.6l-.05-1.45c.65-.32 1.56-.51 2.28-.51 1.74 0 2.78.71 2.78 2.48v4.74zM13.3 5.6h1.82l-.6 1.47h-.04c.67-.98 1.44-1.63 2.62-1.63.12 0 .24.01.34.04l-.32 1.82a1.97 1.97 0 0 0-.41-.04c-1.48 0-2.25 1.45-2.51 2.77l-.73 3.95h-1.92L13.3 5.6zm-3.33 0l-1.75 8.38H6.3l1.75-8.38h1.92zm8.1 0l-1.11 5.37c-.17.85.13 1.16.69 1.16.2 0 .38-.02.57-.08l-.17 1.39c-.33.1-.71.16-1.1.16-1.28 0-2.1-.63-1.8-2.14L16.26 5.6h1.82z"/>
            </svg>
            eBay
          </span>
          {ebayItemId && (
            <EbayListingBadge
              ebayItemId={ebayItemId}
              status={item?.status === "sold" ? "sold" : "active"}
            />
          )}
        </div>
      );
    }
    if (channel === "whatnot") {
      return (
        <span className="inline-flex items-center gap-1 rounded border border-purple-200 bg-purple-50 px-1.5 py-0.5 text-[10px] font-medium text-purple-700">
          Whatnot
        </span>
      );
    }
    if (channel === "show") {
      return (
        <span className="inline-flex items-center gap-1 rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
          Show
        </span>
      );
    }
    if (channel === "local") {
      return (
        <span className="inline-flex items-center rounded border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-700">
          Local
        </span>
      );
    }
    if (channel === "instagram") {
      return (
        <span className="inline-flex items-center rounded border border-pink-200 bg-pink-50 px-1.5 py-0.5 text-[10px] font-medium text-pink-700">
          Instagram
        </span>
      );
    }
    const label = channel
      ? channel.charAt(0).toUpperCase() + channel.slice(1)
      : "—";
    return (
      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#F9FAFB] text-[var(--biz-muted)] border border-[var(--biz-border)]">
        {label}
      </span>
    );
  };

  // ── Mobile card component (< 640px) ──────────────────────────────────────
  const MobileInventoryCard = ({ item, idx }: { item: BusinessInventoryItem; idx: number }) => {
    const days = getDaysHeld(item.acquisition_date);
    const daysColor = getDaysHeldColor(days);
    const titleStr = buildDisplayTitle(item);
    const isWaxItem = item.notes?.includes("[WAX]");
    const cmvFormatted = fmtCents(item.current_market_value_cents);
    const cmvEmpty = !cmvFormatted || item.current_market_value_cents == null || item.current_market_value_cents <= 0;
    const isFetching = fetchingCmvId === item.id;

    return (
      <div
        onClick={() => onItemClick(item)}
        className={`rounded-lg border p-3 transition-colors cursor-pointer ${
          selectedItemId === item.id
            ? "border-emerald-700/60 bg-emerald-50"
            : "border-[var(--biz-border)] bg-white hover:bg-[#F3F4F6]"
        }`}
      >
        {/* Top row: checkbox + title */}
        <div className="flex items-start gap-2.5 mb-2">
          <input
            type="checkbox"
            checked={selected.has(item.id)}
            onChange={(e) => {
              e.stopPropagation();
              toggleOne(item.id);
            }}
            onClick={(e) => e.stopPropagation()}
            className="mt-0.5 min-h-[18px] min-w-[18px] rounded border-[var(--biz-border)] text-emerald-600 focus:ring-emerald-500"
          />
          <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
              {isWaxItem && (
                <span className="inline-flex shrink-0 items-center rounded border border-amber-200 bg-amber-50 px-1 py-0.5 text-[10px] font-semibold whitespace-nowrap text-amber-700">
                  WAX
                </span>
              )}
              <Link
                href={`/card/${item.id}?from=business`}
                onClick={(e) => e.stopPropagation()}
                className="block min-h-[44px] truncate text-sm font-medium text-[var(--biz-text)] hover:underline"
              >
                {titleStr || "Untitled"}
              </Link>
            </div>
          </div>
        </div>

        {/* Key fields in 2x2 grid */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs mb-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[var(--biz-muted)]">Days Held</span>
            <span className={`font-medium tabular-nums ${daysColor}`}>
              {days !== null ? `${days}d` : "\u2014"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[var(--biz-muted)]">Est. MV</span>
            {cmvEmpty ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleFetchCmv(item);
                }}
                disabled={isFetching || !item.title?.trim()}
                className="min-h-[28px] rounded border border-[var(--biz-border)] bg-[#F9FAFB] px-1.5 py-0.5 text-[10px] font-medium text-[var(--biz-text)] hover:bg-[#F3F4F6] disabled:opacity-50"
              >
                {isFetching ? "\u2026" : "Get MV"}
              </button>
            ) : (
              <span className="font-medium tabular-nums text-[var(--biz-text)]">{cmvFormatted}</span>
            )}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[var(--biz-muted)]">Cost</span>
            <span className="font-medium tabular-nums text-[var(--biz-text)]">
              {fmtCents(item.cost_basis_total_cents) || "\u2014"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[var(--biz-muted)]">List $</span>
            <span className="font-medium tabular-nums text-[var(--biz-text)]">
              {fmtCents(item.list_price_cents) || "\u2014"}
            </span>
          </div>
        </div>

        {/* Bottom row: status badge + channel badge + actions */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`px-2 py-1 rounded text-[11px] font-medium ${statusColor(item.status)}`}>
            {item.status}
          </span>
          {item.channel && channelBadge(item.channel, item)}
          <div className="ml-auto flex items-center gap-1.5">
            {item.card_id && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onItemClick(item);
                }}
                className="min-h-[32px] min-w-[44px] rounded border border-[var(--biz-border)] bg-[#F9FAFB] px-2 py-1 text-[11px] font-medium text-[var(--biz-primary)] hover:bg-[#F3F4F6]"
              >
                Grade
              </button>
            )}
            {item.status !== "sold" ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onMarkSold?.(item);
                }}
                className="min-h-[32px] min-w-[44px] rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700 hover:bg-emerald-100"
              >
                Sold
              </button>
            ) : (
              <span className="text-[10px] text-[var(--biz-muted)]">Recorded</span>
            )}
          </div>
        </div>
      </div>
    );
  };

  const shouldVirtualize = filtered.length > VIRTUALIZE_THRESHOLD;
  const virtualTableHeight = useMemo(
    () => Math.min(760, Math.max(360, filtered.length * (dense ? 28 : 34))),
    [dense, filtered.length]
  );

  const handleSortToggle = (key: SortableColumnKey) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === "desc" ? "asc" : "desc"));
      return;
    }
    setSortKey(key);
    setSortDirection("desc");
  };

  const rowClass = (item: BusinessInventoryItem, idx: number): string =>
    `transition-colors cursor-pointer ${
      selectedItemId === item.id
        ? "bg-emerald-50 ring-inset"
        : idx % 2 === 1
        ? "bg-white hover:bg-[#F3F4F6]"
        : "hover:bg-[#F3F4F6]"
    }`;

  const renderHeader = () => (
    <tr>
      <th className={`w-8 shrink-0 ${dense ? "px-3 py-2" : "px-3 py-2"}`}>
        <input
          type="checkbox"
          checked={sortedItems.length > 0 && selected.size === sortedItems.length}
          onChange={toggleAll}
          className="rounded border-[var(--biz-border)] text-emerald-600 focus:ring-emerald-500"
        />
      </th>
      {COLUMNS.map((col) => {
        const isSortable = Boolean(col.sortable);
        const isActiveSort = isSortable && sortKey === col.key;
        const ariaSort = isSortable
          ? isActiveSort
            ? sortDirection === "desc"
              ? "descending"
              : "ascending"
            : "none"
          : undefined;

        return (
          <th
            key={col.key}
            aria-sort={ariaSort}
            className={`border-l border-[var(--biz-border)] px-3 py-2 text-[10px] font-semibold uppercase tracking-normal text-[var(--biz-muted)] ${col.width} ${col.alignRight ? "text-right" : ""}`}
          >
            {isSortable ? (
              <button
                type="button"
                onClick={() => handleSortToggle(col.key as SortableColumnKey)}
                className={`inline-flex cursor-pointer select-none items-center gap-1 ${col.alignRight ? "ml-auto" : ""} hover:text-[var(--biz-text)] focus:outline-none focus-visible:text-[var(--biz-text)]`}
              >
                <span>{col.label}</span>
                {isActiveSort ? (
                  <span aria-hidden="true">
                    {sortDirection === "desc" ? "▼" : "▲"}
                  </span>
                ) : null}
              </button>
            ) : (
              col.label
            )}
          </th>
        );
      })}
    </tr>
  );

  const renderRowCells = (item: BusinessInventoryItem) => (
    <>
      <td
        className={`px-3 py-2`}
        onClick={(e) => e.stopPropagation()}
      >
        <input
          type="checkbox"
          checked={selected.has(item.id)}
          onChange={() => toggleOne(item.id)}
          className="rounded border-[var(--biz-border)] text-emerald-600 focus:ring-emerald-500"
        />
      </td>
      {COLUMNS.map((col) => (
        <td
          key={`${item.id}-${col.key}`}
          className={`border-l border-[var(--biz-border)] px-3 py-2 text-[var(--biz-text)] ${col.width} ${col.alignRight ? "text-right tabular-nums" : ""}`}
          onClick={() => {
            if (col.key === "_actions" || col.key === "_grade" || col.key === "_view") {
              return;
            }
            if (editingCell?.id === item.id && editingCell?.field === col.key) {
              return;
            }
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
          ) : col.key === "channel" ? (
            editingCell?.id === item.id && editingCell?.field === "channel" ? (
              renderCell(item, col.key)
            ) : (
              channelBadge(item.channel, item)
            )
          ) : (
            renderCell(item, col.key)
          )}
        </td>
      ))}
    </>
  );

  return (
    <div>
      {/* Tabs */}
      <div className="flex items-center gap-1 mb-2 border-b border-[var(--biz-border)] overflow-x-auto">
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
            className={`flex items-center gap-1.5 px-3 py-2.5 min-h-[44px] text-xs font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
              activeTab === tab.id
                ? tab.id === "wax"
                  ? "border-amber-600 text-amber-700"
                  : "border-emerald-600 text-emerald-700"
                : "border-transparent text-[var(--biz-muted)] hover:text-[var(--biz-text)]"
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
                    ? "bg-amber-100 text-amber-700"
                    : "bg-emerald-100 text-emerald-700"
                  : "bg-[#F9FAFB] text-[var(--biz-muted)]"
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
            <svg className="w-3.5 h-3.5 text-[var(--biz-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => {
              if (perfEnabled) setPerfInteraction("filter");
              setSearch(e.target.value);
            }}
            placeholder="Search inventory..."
            className="min-h-[44px] w-full rounded-md border border-[var(--biz-border)] bg-white py-2.5 pl-8 pr-2.5 text-sm text-[var(--biz-text)] placeholder:text-[var(--biz-muted)] focus:border-transparent focus:ring-2 focus:ring-emerald-500 sm:min-h-0 sm:py-1.5 sm:text-xs"
          />
        </div>

        {/* Filters - horizontal scroll on mobile */}
        <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto">
          <select
            value={filterStatus}
            onChange={(e) => {
              if (perfEnabled) setPerfInteraction("filter");
              setFilterStatus(e.target.value as any);
            }}
            className="min-h-[44px] flex-1 shrink-0 rounded-md border border-[var(--biz-border)] bg-white px-2.5 py-2.5 text-xs text-[var(--biz-text)] sm:min-h-0 sm:flex-none sm:py-1.5"
          >
            <option value="active">Active (unlisted/listed/pending_sale)</option>
            <option value="all">All Statuses</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          <select
            value={filterChannel}
            onChange={(e) => {
              if (perfEnabled) setPerfInteraction("filter");
              setFilterChannel(e.target.value);
            }}
            className="min-h-[44px] flex-1 shrink-0 rounded-md border border-[var(--biz-border)] bg-white px-2.5 py-2.5 text-xs text-[var(--biz-text)] sm:min-h-0 sm:flex-none sm:py-1.5"
          >
            <option value="">All Channels</option>
            {CHANNEL_OPTIONS.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          <select
            value={filterCondition}
            onChange={(e) => {
              if (perfEnabled) setPerfInteraction("filter");
              setFilterCondition(e.target.value);
            }}
            className="min-h-[44px] flex-1 shrink-0 rounded-md border border-[var(--biz-border)] bg-white px-2.5 py-2.5 text-xs text-[var(--biz-text)] sm:min-h-0 sm:flex-none sm:py-1.5"
          >
            <option value="">Raw & Graded</option>
            {CONDITION_OPTIONS.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          {/* View mode toggle — desktop only */}
          <div className="hidden sm:flex items-center rounded-md border border-[var(--biz-border)] overflow-hidden shrink-0">
            <button
              type="button"
              title="Card grid view"
              onClick={() => setViewMode("grid")}
              className={`flex items-center justify-center w-8 h-8 transition-colors ${
                viewMode === "grid"
                  ? "bg-emerald-600 text-white"
                  : "bg-white text-[var(--biz-muted)] hover:text-[var(--biz-text)] hover:bg-[#F3F4F6]"
              }`}
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <rect x="3" y="3" width="7" height="7" rx="1"/>
                <rect x="14" y="3" width="7" height="7" rx="1"/>
                <rect x="3" y="14" width="7" height="7" rx="1"/>
                <rect x="14" y="14" width="7" height="7" rx="1"/>
              </svg>
            </button>
            <button
              type="button"
              title="One at a time view"
              onClick={() => setViewMode("scroll")}
              className={`flex items-center justify-center w-8 h-8 border-x border-[var(--biz-border)] transition-colors ${
                viewMode === "scroll"
                  ? "bg-emerald-600 text-white"
                  : "bg-white text-[var(--biz-muted)] hover:text-[var(--biz-text)] hover:bg-[#F3F4F6]"
              }`}
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <rect x="5" y="3" width="14" height="18" rx="2"/>
                <path d="M9 8h6M9 12h6M9 16h4"/>
              </svg>
            </button>
            <button
              type="button"
              title="Table view"
              onClick={() => setViewMode("table")}
              className={`flex items-center justify-center w-8 h-8 transition-colors ${
                viewMode === "table"
                  ? "bg-emerald-600 text-white"
                  : "bg-white text-[var(--biz-muted)] hover:text-[var(--biz-text)] hover:bg-[#F3F4F6]"
              }`}
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <path d="M3 9h18M3 15h18M9 3v18"/>
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Bulk actions bar */}
      {selected.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-2">
          <span className="text-sm font-medium text-emerald-700">
            {selected.size} selected
          </span>
          <select
            value={bulkAction}
            onChange={(e) => setBulkAction(e.target.value)}
            className="min-h-[44px] rounded border border-[var(--biz-border)] bg-white px-2 py-2 text-sm text-[var(--biz-text)] sm:min-h-0 sm:py-1"
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
              className="min-h-[44px] rounded border border-[var(--biz-border)] bg-white px-2 py-2 text-sm text-[var(--biz-text)] sm:min-h-0 sm:py-1"
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
              className="min-h-[44px] rounded border border-[var(--biz-border)] bg-white px-2 py-2 text-sm text-[var(--biz-text)] placeholder:text-[var(--biz-muted)] sm:min-h-0 sm:py-1"
            />
          )}
          <button
            onClick={handleBulkExecute}
            disabled={!bulkAction || (bulkAction !== "delete" && !bulkPayload)}
            className="cc-btn-primary min-h-[44px] rounded px-3 py-2 text-sm font-medium text-white disabled:opacity-50 sm:min-h-0 sm:py-1"
          >
            Apply
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="min-h-[44px] px-3 py-2 text-sm text-[var(--biz-muted)] hover:text-[var(--biz-text)] sm:min-h-0 sm:py-1"
          >
            Clear
          </button>
        </div>
      )}

      {/* Mobile card list (< 640px) */}
      <div className="sm:hidden">
        {filtered.length === 0 ? (
          <div className="px-4 py-8 text-center text-xs text-[var(--biz-muted)]">
            {activeTab === "wax"
              ? "No wax / sealed products found. Use Add Wax to track boxes and cases."
              : activeTab === "cards"
              ? "No cards found. Use Add Inventory to add cards to your inventory."
              : "No inventory items found."}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((item, idx) => (
              <MobileInventoryCard key={item.id} item={item} idx={idx} />
            ))}
          </div>
        )}
      </div>

      {/* Desktop grid view (>= 640px) */}
      {viewMode === "grid" && (
        <div className="hidden sm:block">
          <InventoryCardGrid
            items={sortedItems}
            selectedItemId={selectedItemId}
            onItemClick={onItemClick}
            onMarkSold={onMarkSold}
            ebayConnected={ebayConnected}
            onEbayList={(item) => setEbayListingItem(item)}
          />
        </div>
      )}

      {/* Desktop scroll/focus view (>= 640px) */}
      {viewMode === "scroll" && (
        <div className="hidden sm:block">
          <InventoryScrollView
            items={sortedItems}
            onItemClick={onItemClick}
            onMarkSold={onMarkSold}
            ebayConnected={ebayConnected}
            onEbayList={(item) => setEbayListingItem(item)}
          />
        </div>
      )}

      {/* Desktop table (>= 640px) — ledger style: tight rows, right-align money */}
      {viewMode === "table" && <div
        ref={tableContainerRef}
        className="hidden sm:block border border-[var(--biz-border)] rounded-lg overflow-hidden"
        onScrollCapture={() => {
          if (perfEnabled) setPerfInteraction("scroll");
        }}
        onClickCapture={() => {
          if (perfEnabled) setPerfInteraction("click");
        }}
      >
        {filtered.length === 0 ? (
          <div className="px-4 py-8 text-center text-xs text-[var(--biz-muted)]">
            {activeTab === "wax"
              ? "No wax / sealed products found. Use Add Wax to track boxes and cases."
              : activeTab === "cards"
              ? "No cards found. Use Add Inventory to add cards to your inventory."
              : "No inventory items found."}
          </div>
        ) : shouldVirtualize ? (
          <TableVirtuoso
            data={sortedItems}
            style={{ height: virtualTableHeight }}
            components={{
              Scroller: VirtuosoScroller,
              Table: (props) => <table {...props} className="w-full text-xs text-left" />,
              TableHead: (props) => (
                <thead {...props} className="bg-[#F9FAFB] border-b border-[var(--biz-border)]" />
              ),
              TableBody: (props) => <tbody {...props} className="divide-y divide-[var(--biz-border)]" />,
              TableRow: ({ item, context: _context, ...props }) => (
                <tr {...props} className={rowClass(item, props["data-index"])} />
              ),
            }}
            computeItemKey={(_index, item) => item.id}
            fixedHeaderContent={renderHeader}
            itemContent={(_index, item) => renderRowCells(item)}
            increaseViewportBy={240}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="sticky top-0 z-10 bg-[#F9FAFB] border-b border-[var(--biz-border)]">
                {renderHeader()}
              </thead>
              <tbody className="divide-y divide-[var(--biz-border)]">
                {sortedItems.map((item, idx) => (
                  <tr key={item.id} className={rowClass(item, idx)}>
                    {renderRowCells(item)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>}

      <div className="mt-1.5 text-[10px] text-[var(--biz-muted)]">
        {filtered.length} item{filtered.length !== 1 ? "s" : ""}
        {filtered.length !== items.length && ` (of ${items.length} total)`}
        <span className="hidden sm:inline">
          {viewMode === "table" && " \u00B7 Click cell to edit \u00B7 Double-click row to open detail"}
        </span>
        <span className="sm:hidden">
          {" \u00B7 Tap card to open detail"}
        </span>
      </div>

      {/* eBay Listing Modal — opened via "List eBay" button in _actions cell */}
      {ebayListingItem && (
        <EbayListingModal
          item={ebayListingItem}
          isTopRated={ebayTopRated}
          onClose={() => setEbayListingItem(null)}
          onSuccess={(listingId, listingUrl) => {
            // Update item state locally: mark listed, set channel=ebay, set ebay_item_id
            onInlineUpdate(ebayListingItem.id, "ebay_item_id", listingId);
            onInlineUpdate(ebayListingItem.id, "status", "listed");
            onInlineUpdate(ebayListingItem.id, "channel", "ebay");
            setEbayListingItem(null);
          }}
        />
      )}
    </div>
  );
}
