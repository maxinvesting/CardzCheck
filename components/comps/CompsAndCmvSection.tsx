"use client";

import { useState, useEffect, useCallback } from "react";
import type { CollectionItem } from "@/types";
import type { CardComp, CardCmv } from "@/types/comps";
import { buildEbaySoldUrl } from "@/lib/ebay/comps-url";
import CMVDisplay from "./CMVDisplay";
import CompsList from "./CompsList";
import AddCompModal from "./AddCompModal";

interface CompsAndCmvSectionProps {
  card: CollectionItem;
}

export default function CompsAndCmvSection({ card }: CompsAndCmvSectionProps) {
  const [comps, setComps] = useState<CardComp[]>([]);
  const [cmv, setCmv] = useState<CardCmv | null>(null);
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);

  const ebaySearchUrl = buildEbaySoldUrl({
    player: card.player_name,
    year: card.year,
    setName: card.set_name,
    parallel: card.parallel_type,
    cardNumber: card.card_number,
    grade: card.grade,
    gradingCompany: card.grading_company,
  });

  const fetchComps = useCallback(async () => {
    try {
      const res = await fetch(`/api/cards/${card.id}/comps`);
      if (!res.ok) return;
      const data = await res.json();
      setComps(data.comps ?? []);
      setCmv(data.cmv ?? null);
    } catch {
      // non-fatal
    } finally {
      setLoading(false);
    }
  }, [card.id]);

  useEffect(() => {
    fetchComps();
  }, [fetchComps]);

  const recalculate = useCallback(async () => {
    setCalculating(true);
    try {
      const res = await fetch(`/api/cards/${card.id}/cmv/calculate`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        setCmv(data.cmv);
      }
    } catch {
      // non-fatal
    } finally {
      setCalculating(false);
    }
  }, [card.id]);

  const handleToggle = useCallback(
    async (compId: string, selected: boolean) => {
      // Optimistic update
      setComps((prev) =>
        prev.map((c) => (c.id === compId ? { ...c, is_selected: selected } : c))
      );

      try {
        await fetch(`/api/cards/${card.id}/comps/${compId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ is_selected: selected }),
        });
        // Recalculate after toggling
        await recalculate();
      } catch {
        // Revert optimistic update on failure
        setComps((prev) =>
          prev.map((c) => (c.id === compId ? { ...c, is_selected: !selected } : c))
        );
      }
    },
    [card.id, recalculate]
  );

  const handleDelete = useCallback(
    async (compId: string) => {
      const original = comps;
      setComps((prev) => prev.filter((c) => c.id !== compId));

      try {
        await fetch(`/api/cards/${card.id}/comps/${compId}`, { method: "DELETE" });
        await recalculate();
      } catch {
        setComps(original);
      }
    },
    [card.id, comps, recalculate]
  );

  const handleAdd = useCallback(
    async (comp: CardComp) => {
      setComps((prev) => [comp, ...prev]);
      await recalculate();
    },
    [recalculate]
  );

  const selectedCount = comps.filter((c) => c.is_selected).length;
  const excludedCount = comps.filter((c) => !c.is_selected).length;

  return (
    <section className="mt-10 pt-8 border-t border-gray-200 dark:border-gray-800">
      {/* Section header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          Comps &amp; Market Value
        </h2>
        <div className="flex items-center gap-2">
          <a
            href={ebaySearchUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            Search eBay sold
          </a>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add comp
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-6 text-center">
          <svg className="animate-spin h-5 w-5 mx-auto text-gray-400" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        </div>
      ) : (
        <div className="space-y-5">
          {/* CMV display */}
          <div className="bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-800 rounded-xl p-4">
            {calculating ? (
              <div className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4 text-blue-500" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span className="text-sm text-gray-500 dark:text-gray-400">Recalculating…</span>
              </div>
            ) : (
              <CMVDisplay cmv={cmv} />
            )}
          </div>

          {/* Comps list */}
          {comps.length > 0 && (
            <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl px-4">
              <CompsList
                comps={comps}
                onToggle={handleToggle}
                onDelete={handleDelete}
              />
            </div>
          )}

          {/* Transparency footer */}
          {comps.length > 0 && (
            <p className="text-xs text-gray-400 dark:text-gray-500">
              {selectedCount} comp{selectedCount !== 1 ? "s" : ""} included in calculation
              {excludedCount > 0 && ` · ${excludedCount} excluded`}
              {" · "}CMV = median of selected sale prices (±12.5% range)
            </p>
          )}
        </div>
      )}

      {showAddModal && (
        <AddCompModal
          cardId={card.id}
          onAdd={handleAdd}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </section>
  );
}
