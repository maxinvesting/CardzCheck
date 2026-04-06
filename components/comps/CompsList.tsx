"use client";

import { useState } from "react";
import type { CardComp } from "@/types/comps";
import CompItem from "./CompItem";

interface CompsListProps {
  comps: CardComp[];
  onToggle: (id: string, selected: boolean) => void;
  onDelete: (id: string) => void;
  className?: string;
}

const MAX_VISIBLE = 10;

export default function CompsList({ comps, onToggle, onDelete, className = "" }: CompsListProps) {
  const [showAll, setShowAll] = useState(false);

  const selected = comps.filter((c) => c.is_selected);
  const excluded = comps.filter((c) => !c.is_selected);

  const visibleSelected = showAll ? selected : selected.slice(0, MAX_VISIBLE);
  const visibleExcluded = showAll ? excluded : excluded.slice(0, Math.max(0, MAX_VISIBLE - visibleSelected.length));
  const totalVisible = visibleSelected.length + visibleExcluded.length;
  const hasMore = comps.length > totalVisible;

  if (comps.length === 0) {
    return (
      <div className={`${className} py-6 text-center`}>
        <p className="text-sm text-gray-400 dark:text-gray-500">No comps added yet.</p>
      </div>
    );
  }

  return (
    <div className={className}>
      {/* Selected comps */}
      {visibleSelected.length > 0 && (
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {visibleSelected.map((comp) => (
            <CompItem key={comp.id} comp={comp} onToggle={onToggle} onDelete={onDelete} />
          ))}
        </div>
      )}

      {/* Divider between selected and excluded */}
      {visibleExcluded.length > 0 && (
        <>
          {visibleSelected.length > 0 && (
            <div className="flex items-center gap-2 my-2">
              <div className="flex-1 h-px bg-gray-100 dark:bg-gray-800" />
              <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">Excluded</span>
              <div className="flex-1 h-px bg-gray-100 dark:bg-gray-800" />
            </div>
          )}
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {visibleExcluded.map((comp) => (
              <CompItem key={comp.id} comp={comp} onToggle={onToggle} onDelete={onDelete} />
            ))}
          </div>
        </>
      )}

      {/* Show more */}
      {hasMore && (
        <button
          onClick={() => setShowAll(true)}
          className="mt-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
        >
          Show all {comps.length} comps
        </button>
      )}
    </div>
  );
}
