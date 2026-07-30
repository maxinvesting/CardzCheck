"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import BusinessMigrationBanner from "@/components/business/BusinessMigrationBanner";
import CardzCheckListingModal from "@/components/business/CardzCheckListingModal";
import LedgerTable, { type LedgerInlineEditPayload } from "@/components/business/LedgerTable";
import LedgerPhotoGrid from "@/components/business/LedgerPhotoGrid";
import LedgerBulkActionsBar, {
  type LedgerBulkAction,
} from "@/components/business/LedgerBulkActionsBar";
import SaleFormModal from "@/components/business/SaleFormModal";
import TradeFormModal, { type TradeFormPayload } from "@/components/business/TradeFormModal";
import AddCardToInventoryModal from "@/components/business/AddCardToInventoryModal";
import type { PendingInventoryCard } from "@/components/business/AddCardToInventoryModal";
import BulkCertImportModal from "@/components/business/BulkCertImportModal";
import CashManagerModal from "@/components/business/CashManagerModal";
import CardProfileDrawer from "@/components/business/CardProfileDrawer";
import { useTierGates } from "@/hooks/useTierGates";
// Heavy modal (~1.3k lines) — load its chunk only when the modal is opened.
const AddCardModalNew = dynamic(() => import("@/components/AddCardModalNew"), {
  ssr: false,
});
import CardPickerModal from "@/components/CardPickerModal";
import type { CardPickerSelection } from "@/components/CardPicker";
import { createClient } from "@/lib/supabase/client";
import {
  computeLedgerSummary,
  mapInventoryToLedgerRows,
  sortLedgerRows,
  nextLedgerSort,
  ledgerSortToken,
  LEDGER_SORT_PRESETS,
  DEFAULT_LEDGER_SORT,
  type LedgerSummary,
  type LedgerTableRow,
  type LedgerSortState,
} from "@/lib/business/ledger-table";
import type { BusinessInventoryItem } from "@/types";

const MONEY_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

type LedgerViewMode = "spreadsheet" | "photos";

function formatSummaryMoney(cents: number | null): string {
  if (cents == null) return "—";
  return MONEY_FORMATTER.format(cents / 100);
}

function pnlClassName(cents: number | null): string {
  if (cents == null) return "text-[#77808C]";
  if (cents > 0) return "text-[#20B26B]";
  if (cents < 0) return "text-[#E05C5C]";
  return "text-[#B8C0CC]";
}

function LedgerSummaryStrip({
  summary,
  cashBalanceCents,
  onManageCash,
}: {
  summary: LedgerSummary;
  cashBalanceCents: number | null;
  onManageCash: () => void;
}) {
  const cells = [
    {
      label: "Total Inventory Count",
      value: summary.inventoryCount.toLocaleString("en-US"),
      valueClassName: "text-[#E6E8EB]",
    },
    {
      label: "Total Cost Basis",
      value: formatSummaryMoney(summary.totalCostBasisCents),
      valueClassName: "text-[#E6E8EB]",
    },
    {
      label: "Total Estimated Value",
      value: formatSummaryMoney(summary.totalEstimatedValueCents),
      valueClassName: "text-[#E6E8EB]",
    },
    {
      label: "Estimated P&L",
      value: formatSummaryMoney(summary.estimatedPnlCents),
      valueClassName: pnlClassName(summary.estimatedPnlCents),
    },
  ];

  return (
    <div className="overflow-x-auto border-y border-[#24282D] bg-[#0B0D0F]">
      <div className="grid min-w-[920px] grid-cols-5 divide-x divide-[#24282D]">
        {cells.map((cell) => (
          <div key={cell.label} className="px-3 py-2">
            <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-[#77808C]">
              {cell.label}
            </div>
            <div className={`mt-0.5 font-data text-[13px] font-semibold tabular-nums ${cell.valueClassName}`}>
              {cell.value}
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={onManageCash}
          title="Manage cash on hand"
          className="group px-3 py-2 text-left transition-colors hover:bg-[#111315]"
        >
          <div className="flex items-center justify-between">
            <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-[#77808C]">
              Cash on Hand
            </div>
            <span className="text-[10px] font-medium text-[#3B82F6] opacity-0 transition-opacity group-hover:opacity-100">
              Manage
            </span>
          </div>
          <div className="mt-0.5 font-data text-[13px] font-semibold tabular-nums text-[#20B26B]">
            {cashBalanceCents == null ? "—" : formatSummaryMoney(cashBalanceCents)}
          </div>
        </button>
      </div>
    </div>
  );
}

function LoadingLedger() {
  return (
    <>
      <main className="min-h-screen bg-[#090B0D] text-[#E6E8EB]">
        <div className="animate-pulse p-4">
          <div className="mb-3 h-7 w-40 bg-[#1E2227]" />
          <div className="mb-4 grid grid-cols-4 divide-x divide-[#24282D] border-y border-[#24282D]">
            {[0, 1, 2, 3].map((idx) => (
              <div key={idx} className="px-3 py-2">
                <div className="h-3 w-28 bg-[#1E2227]" />
                <div className="mt-2 h-4 w-20 bg-[#1E2227]" />
              </div>
            ))}
          </div>
          <div className="h-[520px] border border-[#24282D] bg-[#0B0D0F]" />
        </div>
      </main>
    </>
  );
}

function SpreadsheetIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 5h16M4 12h16M4 19h16M8 5v14" />
    </svg>
  );
}

function PhotosIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 6a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v2M7 20h11a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2Z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="m8 16 2.25-2.25a1.5 1.5 0 0 1 2.12 0L14 15.38l1.13-1.13a1.5 1.5 0 0 1 2.12 0L19 16M9 10.5h.01" />
    </svg>
  );
}

function LedgerViewToggle({
  value,
  onChange,
}: {
  value: LedgerViewMode;
  onChange: (next: LedgerViewMode) => void;
}) {
  const options: Array<{ value: LedgerViewMode; label: string; icon: ReactNode }> = [
    { value: "spreadsheet", label: "Spreadsheet", icon: <SpreadsheetIcon /> },
    { value: "photos", label: "Photos", icon: <PhotosIcon /> },
  ];

  return (
    <div
      role="group"
      aria-label="Ledger view"
      className="inline-flex rounded-md border border-[#343941] bg-[#0B0D0F] p-0.5"
    >
      {options.map((option) => {
        const active = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            aria-label={`${option.label} view`}
            aria-pressed={active}
            title={`${option.label} view`}
            onClick={() => onChange(option.value)}
            className={`inline-flex h-8 w-10 items-center justify-center rounded transition-colors ${
              active
                ? "bg-[#E6E8EB] text-[#090B0D]"
                : "text-[#B8C0CC] hover:bg-[#1E2227] hover:text-[#E6E8EB]"
            }`}
          >
            {option.icon}
          </button>
        );
      })}
    </div>
  );
}

type UndoActionSummary = {
  id: string;
  type: string;
  label: string;
  created_at: string;
};

export default function LedgerPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [needsMigration, setNeedsMigration] = useState(false);
  const [items, setItems] = useState<BusinessInventoryItem[]>([]);
  const [selectedLedgerItemId, setSelectedLedgerItemId] = useState<string | null>(null);
  const [markSoldItem, setMarkSoldItem] = useState<BusinessInventoryItem | null>(null);
  const [tradeItem, setTradeItem] = useState<BusinessInventoryItem | null>(null);
  const [showStandaloneTrade, setShowStandaloneTrade] = useState(false);
  const [listItem, setListItem] = useState<BusinessInventoryItem | null>(null);
  const [showAddCardModal, setShowAddCardModal] = useState(false);
  const [showBulkCertModal, setShowBulkCertModal] = useState(false);
  const [profileItemId, setProfileItemId] = useState<string | null>(null);
  const { gates } = useTierGates();
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(() => new Set());
  const [isBulkWorking, setIsBulkWorking] = useState(false);
  const [showCardPicker, setShowCardPicker] = useState(false);
  const [showAddCardToInventory, setShowAddCardToInventory] = useState(false);
  const [pendingInventoryCard, setPendingInventoryCard] =
    useState<PendingInventoryCard | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(
    null
  );
  const [latestUndoAction, setLatestUndoAction] =
    useState<UndoActionSummary | null>(null);
  const [undoingLedgerAction, setUndoingLedgerAction] = useState(false);
  const [viewMode, setViewMode] = useState<LedgerViewMode>("spreadsheet");
  const [sort, setSort] = useState<LedgerSortState>(DEFAULT_LEDGER_SORT);
  const [cashBalanceCents, setCashBalanceCents] = useState<number | null>(null);
  const [showCashModal, setShowCashModal] = useState(false);

  const activeInventoryItems = useMemo(
    () =>
      items.filter(
        (item) =>
          item.status !== "sold" &&
          item.status !== "returned" &&
          item.status !== "traded"
      ),
    [items]
  );

  const ledgerRows = useMemo(
    () => mapInventoryToLedgerRows(activeInventoryItems),
    [activeInventoryItems]
  );

  const sortedLedgerRows = useMemo(
    () => sortLedgerRows(ledgerRows, sort),
    [ledgerRows, sort]
  );

  const ledgerSummary = useMemo(
    () => computeLedgerSummary(ledgerRows),
    [ledgerRows]
  );

  const loadInventory = useCallback(async () => {
    try {
      const res = await fetch("/api/business/inventory", { cache: "no-store" });

      if (res.status === 401) {
        router.push("/login?redirect=/business/ledger");
        return;
      }

      if (res.status === 403) {
        setHasAccess(false);
        setItems([]);
        return;
      }

      const data = await res.json();

      if (res.status === 503 && data?.needs_migration) {
        setNeedsMigration(true);
        setHasAccess(true);
        setItems([]);
        return;
      }

      if (!res.ok) {
        throw new Error(data?.error || "Failed to load inventory");
      }

      setNeedsMigration(false);
      setHasAccess(true);
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch {
      setHasAccess(false);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    async function init() {
      const supabase = createClient();
      await supabase.auth.refreshSession();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login?redirect=/business/ledger");
        return;
      }

      await loadInventory();
    }

    init();
  }, [loadInventory, router]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // Deep links from the dashboard quick actions (e.g. ?action=trade) open the
  // matching standalone modal on mount, then clean the URL.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const action = new URLSearchParams(window.location.search).get("action");
    if (action === "trade") {
      setShowStandaloneTrade(true);
    }
    if (action) {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  const loadLatestUndoAction = useCallback(async () => {
    try {
      const res = await fetch("/api/business/ledger/undo", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setLatestUndoAction(data?.action ?? null);
    } catch {
      // non-fatal
    }
  }, []);

  const loadCashBalance = useCallback(async () => {
    try {
      const res = await fetch("/api/business/cash", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      if (typeof data?.balance_cents === "number") {
        setCashBalanceCents(data.balance_cents);
      }
    } catch {
      // non-fatal
    }
  }, []);

  useEffect(() => {
    if (hasAccess) {
      void loadLatestUndoAction();
      void loadCashBalance();
    }
  }, [hasAccess, loadLatestUndoAction, loadCashBalance]);

  const handleUndoLedgerAction = useCallback(async () => {
    if (!latestUndoAction || undoingLedgerAction) return;
    const confirmed = window.confirm(
      `Undo the last ledger action (${latestUndoAction.label})?`
    );
    if (!confirmed) return;
    setUndoingLedgerAction(true);
    try {
      const res = await fetch("/api/business/ledger/undo", {
        method: "DELETE",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Failed to undo ledger action");
      setToast({
        type: "success",
        message: data?.action?.label
          ? `Undid ${data.action.label}`
          : "Last ledger action undone",
      });
      setLatestUndoAction(null);
      await loadInventory();
      await loadLatestUndoAction();
      void loadCashBalance();
    } catch (error) {
      setToast({
        type: "error",
        message:
          error instanceof Error ? error.message : "Failed to undo ledger action",
      });
    } finally {
      setUndoingLedgerAction(false);
    }
  }, [latestUndoAction, loadInventory, loadLatestUndoAction, loadCashBalance, undoingLedgerAction]);

  const handleLedgerRowClick = useCallback((row: LedgerTableRow) => {
    setSelectedLedgerItemId(row.id);
    setProfileItemId(row.id);
  }, []);

  const handleToggleRow = useCallback((rowId: string) => {
    setSelectedRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  }, []);

  const handleToggleAll = useCallback(
    (allSelected: boolean) => {
      if (allSelected) {
        setSelectedRowIds(new Set());
      } else {
        setSelectedRowIds(new Set(ledgerRows.map((r) => r.id)));
      }
    },
    [ledgerRows]
  );

  const clearSelection = useCallback(() => setSelectedRowIds(new Set()), []);

  const handleInlineEdit = useCallback(
    async ({ rowId, field, value }: LedgerInlineEditPayload) => {
      try {
        const res = await fetch("/api/business/inventory", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: rowId, [field]: value }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error || "Failed to save");
        const updated = data as BusinessInventoryItem;
        setItems((prev) => prev.map((item) => (item.id === rowId ? updated : item)));
        void loadLatestUndoAction();
      } catch (error) {
        setToast({
          type: "error",
          message: error instanceof Error ? error.message : "Failed to save",
        });
      }
    },
    [loadLatestUndoAction]
  );

  const handleBulkAction = useCallback(
    async (action: LedgerBulkAction) => {
      const ids = Array.from(selectedRowIds);
      if (ids.length === 0) return;
      setIsBulkWorking(true);
      try {
        if (action.type === "delete") {
          const params = new URLSearchParams({ ids: ids.join(",") });
          const res = await fetch(`/api/business/inventory?${params.toString()}`, {
            method: "DELETE",
          });
          if (!res.ok) {
            const data = await res.json().catch(() => null);
            throw new Error(data?.error || "Failed to delete");
          }
          setItems((prev) => prev.filter((item) => !selectedRowIds.has(item.id)));
          setSelectedRowIds(new Set());
          setToast({ type: "success", message: `Deleted ${ids.length} item(s)` });
          await loadLatestUndoAction();
        } else {
          const updates: Record<string, unknown> = {};
          if (action.type === "status") updates.status = action.value;
          if (action.type === "channel") updates.channel = action.value;
          if (action.type === "list_price_cents") updates.list_price_cents = action.value;
          const res = await fetch("/api/business/inventory/bulk", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ids, updates }),
          });
          if (!res.ok) {
            const data = await res.json().catch(() => null);
            throw new Error(data?.error || "Failed to update");
          }
          setToast({ type: "success", message: `Updated ${ids.length} item(s)` });
          await loadInventory();
          await loadLatestUndoAction();
        }
      } catch (error) {
        setToast({
          type: "error",
          message: error instanceof Error ? error.message : "Bulk action failed",
        });
      } finally {
        setIsBulkWorking(false);
      }
    },
    [loadInventory, loadLatestUndoAction, selectedRowIds]
  );

  const handleCreateSale = useCallback(
    async (sale: Record<string, unknown>) => {
      const inventoryId = (sale.inventory_item_id as string | null) || null;
      const quantitySold =
        typeof sale.quantity_sold === "number" ? (sale.quantity_sold as number) : null;
      try {
        const res = await fetch("/api/business/sales", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(sale),
        });

        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error || "Failed to record sale");

        if (inventoryId) {
          // Determine if this was a partial sale based on the source row's quantity.
          const sourceItem = items.find((it) => it.id === inventoryId);
          const lotQty = sourceItem?.quantity ?? 1;
          const isPartial =
            quantitySold != null && quantitySold > 0 && quantitySold < lotQty;

          if (isPartial) {
            // Refresh inventory so the row reflects the new quantity / pro-rated basis.
            void loadInventory();
          } else {
            setItems((prev) => prev.filter((item) => item.id !== inventoryId));
            if (selectedLedgerItemId === inventoryId) setSelectedLedgerItemId(null);
          }
        }
        setToast({ type: "success", message: "Sale recorded" });
        setMarkSoldItem(null);
        void loadLatestUndoAction();
        void loadCashBalance();
      } catch (error) {
        setToast({
          type: "error",
          message: error instanceof Error ? error.message : "Failed to record sale",
        });
      }
    },
    [items, loadInventory, loadLatestUndoAction, loadCashBalance, selectedLedgerItemId]
  );

  const handleCreateTrade = useCallback(
    async (payload: TradeFormPayload) => {
      try {
        const res = await fetch("/api/business/trades", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error || "Failed to record trade");

        const outgoingIds = new Set<string>();
        for (const o of payload.outgoing ?? []) outgoingIds.add(o.inventory_item_id);
        if (payload.inventory_item_id) outgoingIds.add(payload.inventory_item_id);

        if (outgoingIds.size > 0) {
          setItems((prev) => prev.filter((item) => !outgoingIds.has(item.id)));
          if (selectedLedgerItemId && outgoingIds.has(selectedLedgerItemId)) {
            setSelectedLedgerItemId(null);
          }
        }
        setTradeItem(null);
        setShowStandaloneTrade(false);
        // Reload inventory to surface any new incoming cards added by the trade.
        void loadInventory();
        void loadLatestUndoAction();
        void loadCashBalance();
        setToast({ type: "success", message: "Trade recorded" });
      } catch (error) {
        setToast({
          type: "error",
          message: error instanceof Error ? error.message : "Failed to record trade",
        });
      }
    },
    [loadInventory, loadLatestUndoAction, loadCashBalance, selectedLedgerItemId]
  );

  const handleListSuccess = useCallback(
    async (_listingId: string) => {
      setListItem(null);
      setToast({ type: "success", message: "Listed on MH_Cardz Business Hub" });
      await loadInventory();
    },
    [loadInventory]
  );

  const handleCardAdded = useCallback(
    (playerName: string) => {
      setPendingInventoryCard(null);
      setToast({ type: "success", message: `Added "${playerName}" to inventory` });
      void loadInventory();
      void loadLatestUndoAction();
    },
    [loadInventory, loadLatestUndoAction]
  );

  const handleCardPickerSelect = useCallback((card: CardPickerSelection) => {
    setShowCardPicker(false);
    setPendingInventoryCard({
      card_id: card.id || undefined,
      player_name: card.player_name,
      year: card.year,
      set_name: card.set_name,
      parallel_type: card.variant,
      card_number: card.card_number,
      grader: card.grader,
      grade: card.grade,
      imageUrl: card.user_image_url || card.image_url,
      user_image_url: card.user_image_url,
      quantity: card.quantity,
    });
    setShowAddCardToInventory(true);
  }, []);

  const handleCardIdentified = useCallback(
    (cardData: {
      card_id?: string;
      player_name: string;
      year?: string;
      set_name?: string;
      card_number?: string;
      parallel_type?: string;
      grade?: string;
      grader?: string;
      psa_cert_number?: string;
      imageUrl?: string;
      imageUrls?: string[];
      user_image_url?: string;
      quantity?: number;
      manualEntry?: boolean;
    }) => {
      setShowAddCardModal(false);
      setPendingInventoryCard(cardData);
      setShowAddCardToInventory(true);
    },
    []
  );

  if (loading) return <LoadingLedger />;

  if (hasAccess === false) {
    return (
      <>
        <main className="min-h-screen bg-[#090B0D] px-4 py-4">
        </main>
      </>
    );
  }

  return (
    <>
      <main className="min-h-screen bg-[#090B0D] text-[#E6E8EB]">
        <div className="flex min-h-screen flex-col">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#24282D] px-4 py-3">
            <div>
              <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-[#77808C]">
                Inventory
              </div>
              <h1 className="mt-0.5 text-[18px] font-semibold tracking-normal text-[#E6E8EB]">
                Ledger
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleUndoLedgerAction}
                disabled={!latestUndoAction || undoingLedgerAction}
                title={
                  latestUndoAction
                    ? `Undo last ledger action: ${latestUndoAction.label}`
                    : "No ledger action to undo"
                }
                className="border border-[#5A4A1F] bg-[#251E0E] px-3 py-1.5 text-[12px] font-semibold text-[#F0B429] transition-colors hover:bg-[#33290F] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {undoingLedgerAction ? "Undoing…" : "Undo"}
              </button>
              <button
                type="button"
                onClick={() => setShowStandaloneTrade(true)}
                className="border border-[#343941] px-3 py-1.5 text-[12px] font-medium text-[#B8C0CC] transition-colors hover:border-[#5A626E] hover:text-[#E6E8EB]"
              >
                Trade
              </button>
              {gates?.canBulkAddByCert ? (
                <button
                  type="button"
                  onClick={() => setShowBulkCertModal(true)}
                  className="border border-[#343941] px-3 py-1.5 text-[12px] font-medium text-[#B8C0CC] transition-colors hover:border-[#5A626E] hover:text-[#E6E8EB]"
                >
                  Bulk add by cert
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setShowAddCardModal(true)}
                className="border border-[#20B26B] bg-[#20B26B] px-3 py-1.5 text-[12px] font-semibold text-[#07100B] transition-colors hover:bg-[#33C47C]"
              >
                Add card
              </button>
            </div>
          </header>

          <LedgerSummaryStrip
            summary={ledgerSummary}
            cashBalanceCents={cashBalanceCents}
            onManageCash={() => setShowCashModal(true)}
          />

          {needsMigration ? (
            <div className="px-4 py-4">
              <BusinessMigrationBanner
                onRetry={() => {
                  setLoading(true);
                  void loadInventory();
                }}
              />
            </div>
          ) : (
            <section className="min-w-0 flex-1 px-4 py-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div className="text-[12px] text-[#77808C]">
                  {ledgerRows.length.toLocaleString("en-US")} active card{ledgerRows.length === 1 ? "" : "s"}
                </div>
                <div className="flex items-center gap-2">
                  {viewMode === "photos" ? (
                    <label className="flex items-center gap-1.5">
                      <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-[#77808C]">
                        Sort
                      </span>
                      <select
                        value={ledgerSortToken(sort)}
                        onChange={(e) => {
                          const preset = LEDGER_SORT_PRESETS.find(
                            (option) => ledgerSortToken(option.state) === e.target.value
                          );
                          if (preset) setSort(preset.state);
                        }}
                        className="border border-[#343941] bg-[#0B0D0F] px-2 py-1.5 text-[12px] font-medium text-[#B8C0CC] focus:border-[#20B26B] focus:outline-none"
                      >
                        {LEDGER_SORT_PRESETS.map((option) => (
                          <option key={ledgerSortToken(option.state)} value={ledgerSortToken(option.state)}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  <LedgerViewToggle value={viewMode} onChange={setViewMode} />
                </div>
              </div>

              {selectedRowIds.size > 0 && (
                <div className="mb-3">
                  <LedgerBulkActionsBar
                    selectedCount={selectedRowIds.size}
                    isWorking={isBulkWorking}
                    onClear={clearSelection}
                    onApply={handleBulkAction}
                  />
                </div>
              )}
              {viewMode === "spreadsheet" ? (
                <LedgerTable
                  rows={sortedLedgerRows}
                  selectedRowId={selectedLedgerItemId}
                  onRowClick={handleLedgerRowClick}
                  selectedRowIds={selectedRowIds}
                  onToggleRow={handleToggleRow}
                  onToggleAll={handleToggleAll}
                  onInlineEdit={handleInlineEdit}
                  onOpenProfile={(row) => setProfileItemId(row.id)}
                  onQuickSale={(row) => setMarkSoldItem(row.item)}
                  sort={sort}
                  onSort={(column) => setSort((current) => nextLedgerSort(current, column))}
                />
              ) : (
                <LedgerPhotoGrid
                  rows={sortedLedgerRows}
                  selectedRowId={selectedLedgerItemId}
                  onRowClick={handleLedgerRowClick}
                  selectedRowIds={selectedRowIds}
                  onToggleRow={handleToggleRow}
                  onToggleAll={handleToggleAll}
                />
              )}
            </section>
          )}
        </div>

        <CardProfileDrawer
          isOpen={profileItemId != null}
          itemId={profileItemId}
          item={
            profileItemId ? items.find((it) => it.id === profileItemId) ?? null : null
          }
          mode="business"
          onClose={() => {
            setProfileItemId(null);
            setSelectedLedgerItemId(null);
          }}
          onSaved={(updated) => {
            setItems((prev) => prev.map((it) => (it.id === updated.id ? updated : it)));
            void loadLatestUndoAction();
          }}
          onMarkSold={(it) => {
            setProfileItemId(null);
            setMarkSoldItem(it);
          }}
          onTrade={(it) => {
            setProfileItemId(null);
            setTradeItem(it);
          }}
          onList={(it) => {
            setProfileItemId(null);
            setListItem(it);
          }}
        />

        <CashManagerModal
          isOpen={showCashModal}
          onClose={() => setShowCashModal(false)}
          onChanged={() => void loadCashBalance()}
        />

        <BulkCertImportModal
          isOpen={showBulkCertModal}
          onClose={() => setShowBulkCertModal(false)}
          onSuccess={(count) => {
            if (count > 0) {
              setToast({
                type: "success",
                message: `Added ${count} card${count === 1 ? "" : "s"} to inventory`,
              });
              void loadInventory();
              void loadLatestUndoAction();
            }
          }}
        />

        {showAddCardModal && (
        <AddCardModalNew
          isOpen={showAddCardModal}
          onClose={() => setShowAddCardModal(false)}
          onSuccess={() => {}}
          onLimitReached={() => {}}
          addMode="business"
          modalTitle="Add Card to Inventory"
          onOpenSmartSearch={() => {
            setShowAddCardModal(false);
            setShowCardPicker(true);
          }}
          onCardSelected={handleCardIdentified}
        />
        )}

        <CardPickerModal
          isOpen={showCardPicker}
          title="Add Card to Inventory"
          mode="collection"
          onClose={() => setShowCardPicker(false)}
          onSelect={handleCardPickerSelect}
          quantityEnabled
        />

        <AddCardToInventoryModal
          isOpen={showAddCardToInventory}
          card={pendingInventoryCard}
          onClose={() => {
            setShowAddCardToInventory(false);
            setPendingInventoryCard(null);
          }}
          onSuccess={handleCardAdded}
        />

        <SaleFormModal
          isOpen={Boolean(markSoldItem)}
          title={markSoldItem ? `Mark as sold: ${markSoldItem.title}` : "Mark as sold"}
          submitLabel="Record sale"
          defaults={
            markSoldItem
              ? {
                  inventory_item_id: markSoldItem.id,
                  channel: markSoldItem.channel,
                  sold_at: new Date().toISOString(),
                  cogs_cents: markSoldItem.cost_basis_total_cents,
                }
              : undefined
          }
          inventoryQuantity={markSoldItem?.quantity ?? 1}
          inventoryCostBasisCents={markSoldItem?.cost_basis_total_cents ?? null}
          onClose={() => setMarkSoldItem(null)}
          onSubmit={async (payload) => {
            await handleCreateSale(payload as unknown as Record<string, unknown>);
          }}
          showCogsField={false}
        />

        <TradeFormModal
          isOpen={Boolean(tradeItem)}
          item={tradeItem}
          availableItems={activeInventoryItems}
          onClose={() => setTradeItem(null)}
          onSubmit={handleCreateTrade}
        />

        <TradeFormModal
          isOpen={showStandaloneTrade}
          availableItems={activeInventoryItems}
          onClose={() => setShowStandaloneTrade(false)}
          onSubmit={handleCreateTrade}
        />

        {listItem && (
          <CardzCheckListingModal
            item={listItem}
            onClose={() => setListItem(null)}
            onSuccess={handleListSuccess}
          />
        )}

        {toast && (
          <div
            className={`fixed bottom-4 right-4 z-50 border px-4 py-3 text-sm ${
              toast.type === "success"
                ? "border-[#1F5F45] bg-[#0E251B] text-[#20B26B]"
                : "border-[#723030] bg-[#2A1111] text-[#E05C5C]"
            }`}
          >
            <span>{toast.message}</span>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="ml-3 text-current opacity-70 hover:opacity-100"
            >
              x
            </button>
          </div>
        )}
      </main>
    </>
  );
}
