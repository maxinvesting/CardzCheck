"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AuthenticatedLayout from "@/components/AuthenticatedLayout";
import BusinessPaywall from "@/components/business/BusinessPaywall";
import BusinessMigrationBanner from "@/components/business/BusinessMigrationBanner";
import LedgerTable from "@/components/business/LedgerTable";
import AddCardToInventoryModal from "@/components/business/AddCardToInventoryModal";
import type { PendingInventoryCard } from "@/components/business/AddCardToInventoryModal";
import AddCardModalNew from "@/components/AddCardModalNew";
import CardPickerModal from "@/components/CardPickerModal";
import type { CardPickerSelection } from "@/components/CardPicker";
import { createClient } from "@/lib/supabase/client";
import {
  computeLedgerSummary,
  mapInventoryToLedgerRows,
  type LedgerSummary,
  type LedgerTableRow,
} from "@/lib/business/ledger-table";
import type { BusinessInventoryItem } from "@/types";

const MONEY_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

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

function LedgerSummaryStrip({ summary }: { summary: LedgerSummary }) {
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
      <div className="grid min-w-[760px] grid-cols-4 divide-x divide-[#24282D]">
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
      </div>
    </div>
  );
}

function LoadingLedger() {
  return (
    <AuthenticatedLayout>
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
    </AuthenticatedLayout>
  );
}

export default function LedgerPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [needsMigration, setNeedsMigration] = useState(false);
  const [items, setItems] = useState<BusinessInventoryItem[]>([]);
  const [selectedLedgerItemId, setSelectedLedgerItemId] = useState<string | null>(null);
  const [showAddCardModal, setShowAddCardModal] = useState(false);
  const [showCardPicker, setShowCardPicker] = useState(false);
  const [showAddCardToInventory, setShowAddCardToInventory] = useState(false);
  const [pendingInventoryCard, setPendingInventoryCard] =
    useState<PendingInventoryCard | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(
    null
  );

  const activeInventoryItems = useMemo(
    () => items.filter((item) => item.status !== "sold" && item.status !== "returned"),
    [items]
  );

  const ledgerRows = useMemo(
    () => mapInventoryToLedgerRows(activeInventoryItems),
    [activeInventoryItems]
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

  const handleLedgerRowClick = useCallback((row: LedgerTableRow) => {
    // Future detail drawer entrypoint.
    setSelectedLedgerItemId(row.id);
  }, []);

  const handleCardAdded = useCallback(
    (playerName: string) => {
      setPendingInventoryCard(null);
      setToast({ type: "success", message: `Added "${playerName}" to inventory` });
      void loadInventory();
    },
    [loadInventory]
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
      user_image_url?: string;
      quantity?: number;
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
      <AuthenticatedLayout>
        <main className="min-h-screen bg-[#090B0D] px-4 py-4">
          <BusinessPaywall />
        </main>
      </AuthenticatedLayout>
    );
  }

  return (
    <AuthenticatedLayout>
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
              <a
                href="/api/business/export?type=inventory"
                className="border border-[#343941] px-3 py-1.5 text-[12px] font-medium text-[#B8C0CC] transition-colors hover:border-[#5A626E] hover:text-[#E6E8EB]"
              >
                Export
              </a>
              <button
                type="button"
                onClick={() => setShowAddCardModal(true)}
                className="border border-[#20B26B] bg-[#20B26B] px-3 py-1.5 text-[12px] font-semibold text-[#07100B] transition-colors hover:bg-[#33C47C]"
              >
                Add card
              </button>
            </div>
          </header>

          <LedgerSummaryStrip summary={ledgerSummary} />

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
              <LedgerTable
                rows={ledgerRows}
                selectedRowId={selectedLedgerItemId}
                onRowClick={handleLedgerRowClick}
              />
            </section>
          )}
        </div>

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
    </AuthenticatedLayout>
  );
}
