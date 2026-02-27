"use client";

import { useState } from "react";

const PRICE_RANGES = [
  { value: "", label: "Price: All" },
  { value: "0-25", label: "Under $25" },
  { value: "25-50", label: "$25–$50" },
  { value: "50-100", label: "$50–$100" },
  { value: "100-200", label: "$100–$200" },
  { value: "200+", label: "$200+" },
] as const;

const SORTS = [
  { value: "featured", label: "Featured" },
  { value: "newest", label: "Newest" },
  { value: "price_asc", label: "Price: Low to High" },
  { value: "price_desc", label: "Price: High to Low" },
  { value: "discount", label: "Biggest Discount" },
  { value: "player", label: "Player A-Z" },
] as const;

export type SortValue = (typeof SORTS)[number]["value"];
export type PriceRangeValue = (typeof PRICE_RANGES)[number]["value"];

export interface ShopFilterBarProps {
  sports: string[];
  grades: string[];
  sportFilter: string | null;
  gradeFilter: string | null;
  priceRange: PriceRangeValue;
  belowCmvOnly: boolean;
  sort: SortValue;
  onSportChange: (value: string | null) => void;
  onGradeChange: (value: string | null) => void;
  onPriceRangeChange: (value: PriceRangeValue) => void;
  onBelowCmvChange: (value: boolean) => void;
  onSortChange: (value: SortValue) => void;
  resultCount: number;
}

function FilterControls({
  sports,
  grades,
  sportFilter,
  gradeFilter,
  priceRange,
  belowCmvOnly,
  sort,
  onSportChange,
  onGradeChange,
  onPriceRangeChange,
  onBelowCmvChange,
  onSortChange,
  compact = false,
}: Omit<ShopFilterBarProps, "resultCount"> & { compact?: boolean }) {
  const baseSelect =
    "px-3 py-2 rounded-lg bg-gray-800/80 text-gray-300 text-sm border border-gray-700/60 focus:border-cyan-500/50 focus:outline-none min-w-0";

  return (
    <div
      className={`flex flex-wrap items-center gap-2 ${compact ? "flex-col" : ""}`}
    >
      <select
        value={sportFilter ?? ""}
        onChange={(e) => onSportChange(e.target.value || null)}
        className={baseSelect}
      >
        <option value="">Sport: All</option>
        {sports.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>

      <select
        value={gradeFilter ?? ""}
        onChange={(e) => onGradeChange(e.target.value || null)}
        className={baseSelect}
      >
        <option value="">Grade: All</option>
        {grades.map((g) => (
          <option key={g} value={g}>
            {g}
          </option>
        ))}
      </select>

      <select
        value={priceRange}
        onChange={(e) =>
          onPriceRangeChange(e.target.value as PriceRangeValue)
        }
        className={baseSelect}
      >
        {PRICE_RANGES.map((r) => (
          <option key={r.value || "all"} value={r.value}>
            {r.label}
          </option>
        ))}
      </select>

      <label className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-800/80 border border-gray-700/60 cursor-pointer hover:border-gray-600 transition-colors">
        <input
          type="checkbox"
          checked={belowCmvOnly}
          onChange={(e) => onBelowCmvChange(e.target.checked)}
          className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-cyan-500 focus:ring-cyan-500/50"
        />
        <span className="text-sm text-gray-400 whitespace-nowrap">
          Below CMV
        </span>
      </label>

      <select
        value={sort}
        onChange={(e) => onSortChange(e.target.value as SortValue)}
        className={baseSelect}
      >
        {SORTS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export default function ShopFilterBar({
  sports,
  grades,
  sportFilter,
  gradeFilter,
  priceRange,
  belowCmvOnly,
  sort,
  onSportChange,
  onGradeChange,
  onPriceRangeChange,
  onBelowCmvChange,
  onSortChange,
  resultCount,
}: ShopFilterBarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Desktop: horizontal filter row */}
      <div className="hidden md:flex items-center justify-between gap-4 flex-wrap">
        <FilterControls
          sports={sports}
          grades={grades}
          sportFilter={sportFilter}
          gradeFilter={gradeFilter}
          priceRange={priceRange}
          belowCmvOnly={belowCmvOnly}
          sort={sort}
          onSportChange={onSportChange}
          onGradeChange={onGradeChange}
          onPriceRangeChange={onPriceRangeChange}
          onBelowCmvChange={onBelowCmvChange}
          onSortChange={onSortChange}
        />
        <span className="text-sm text-gray-500 tabular-nums">
          {resultCount} listings
        </span>
      </div>

      {/* Mobile: Filters button + slide-over */}
      <div className="flex md:hidden items-center justify-between gap-3">
        <button
          onClick={() => setMobileOpen(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-800/80 border border-gray-700/60 text-sm text-gray-300 hover:text-white hover:border-gray-600 transition-colors"
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
              d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
            />
          </svg>
          Filters
        </button>
        <span className="text-sm text-gray-500 tabular-nums">
          {resultCount} listings
        </span>
      </div>

      {/* Mobile slide-over */}
      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <div
            className="fixed inset-y-0 right-0 z-50 w-full max-w-sm bg-[#0f1419] border-l border-gray-800 shadow-xl p-6 overflow-y-auto md:hidden"
            role="dialog"
            aria-label="Filters"
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-white">Filters</h3>
              <button
                onClick={() => setMobileOpen(false)}
                className="p-2 text-gray-400 hover:text-white rounded-lg transition-colors"
                aria-label="Close filters"
              >
                <svg
                  className="w-5 h-5"
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
            <FilterControls
              sports={sports}
              grades={grades}
              sportFilter={sportFilter}
              gradeFilter={gradeFilter}
              priceRange={priceRange}
              belowCmvOnly={belowCmvOnly}
              sort={sort}
              onSportChange={onSportChange}
              onGradeChange={onGradeChange}
              onPriceRangeChange={onPriceRangeChange}
              onBelowCmvChange={onBelowCmvChange}
              onSortChange={(v) => {
                onSortChange(v);
                setMobileOpen(false);
              }}
              compact
            />
            <button
              onClick={() => setMobileOpen(false)}
              className="mt-6 w-full py-3 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white font-medium transition-colors"
            >
              Apply
            </button>
          </div>
        </>
      )}
    </>
  );
}
