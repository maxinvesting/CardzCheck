"use client";

import { useState } from "react";

const PRICE_RANGES = [
  { value: "", label: "Price: All" },
  { value: "0-25", label: "Under $25" },
  { value: "25-50", label: "$25-$50" },
  { value: "50-100", label: "$50-$100" },
  { value: "100-200", label: "$100-$200" },
  { value: "200+", label: "$200+" },
] as const;

const SORTS = [
  { value: "newest", label: "Newest" },
  { value: "price_asc", label: "Price: Low-High" },
  { value: "price_desc", label: "Price: High-Low" },
] as const;

export type SortValue = (typeof SORTS)[number]["value"];
export type PriceRangeValue = (typeof PRICE_RANGES)[number]["value"];

export interface ShopFilterBarProps {
  search: string;
  categories: string[];
  grades: string[];
  categoryFilter: string | null;
  gradeFilter: string | null;
  priceRange: PriceRangeValue;
  sort: SortValue;
  offersOnly: boolean;
  onSearchChange: (value: string) => void;
  onCategoryChange: (value: string | null) => void;
  onGradeChange: (value: string | null) => void;
  onPriceRangeChange: (value: PriceRangeValue) => void;
  onSortChange: (value: SortValue) => void;
  onOffersOnlyChange: (value: boolean) => void;
  resultCount: number;
}

function FilterControls({
  search,
  categories,
  grades,
  categoryFilter,
  gradeFilter,
  priceRange,
  sort,
  offersOnly,
  onSearchChange,
  onCategoryChange,
  onGradeChange,
  onPriceRangeChange,
  onSortChange,
  onOffersOnlyChange,
}: Omit<ShopFilterBarProps, "resultCount">) {
  const baseSelect =
    "h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 focus:border-cyan-500 focus:outline-none";

  return (
    <div className="grid gap-2 md:grid-cols-[minmax(220px,1.3fr)_repeat(4,minmax(0,1fr))_auto]">
      <input
        type="search"
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
        placeholder="Search card, set, year, tags..."
        className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none"
      />

      <select
        value={categoryFilter ?? ""}
        onChange={(event) => onCategoryChange(event.target.value || null)}
        className={baseSelect}
      >
        <option value="">Category</option>
        {categories.map((category) => (
          <option key={category} value={category}>
            {category}
          </option>
        ))}
      </select>

      <select
        value={gradeFilter ?? ""}
        onChange={(event) => onGradeChange(event.target.value || null)}
        className={baseSelect}
      >
        <option value="">Grade</option>
        {grades.map((grade) => (
          <option key={grade} value={grade}>
            {grade}
          </option>
        ))}
      </select>

      <select
        value={priceRange}
        onChange={(event) => onPriceRangeChange(event.target.value as PriceRangeValue)}
        className={baseSelect}
      >
        {PRICE_RANGES.map((range) => (
          <option key={range.value || "all"} value={range.value}>
            {range.label}
          </option>
        ))}
      </select>

      <select
        value={sort}
        onChange={(event) => onSortChange(event.target.value as SortValue)}
        className={baseSelect}
      >
        {SORTS.map((sortOption) => (
          <option key={sortOption.value} value={sortOption.value}>
            {sortOption.label}
          </option>
        ))}
      </select>

      <label className="flex h-10 cursor-pointer items-center gap-2 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800">
        <input
          type="checkbox"
          checked={offersOnly}
          onChange={(event) => onOffersOnlyChange(event.target.checked)}
          className="h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
        />
        Offers only
      </label>
    </div>
  );
}

export default function ShopFilterBar({
  search,
  categories,
  grades,
  categoryFilter,
  gradeFilter,
  priceRange,
  sort,
  offersOnly,
  onSearchChange,
  onCategoryChange,
  onGradeChange,
  onPriceRangeChange,
  onSortChange,
  onOffersOnlyChange,
  resultCount,
}: ShopFilterBarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      <div className="hidden items-center justify-between gap-4 md:flex">
        <div className="w-full">
          <FilterControls
            search={search}
            categories={categories}
            grades={grades}
            categoryFilter={categoryFilter}
            gradeFilter={gradeFilter}
            priceRange={priceRange}
            sort={sort}
            offersOnly={offersOnly}
            onSearchChange={onSearchChange}
            onCategoryChange={onCategoryChange}
            onGradeChange={onGradeChange}
            onPriceRangeChange={onPriceRangeChange}
            onSortChange={onSortChange}
            onOffersOnlyChange={onOffersOnlyChange}
          />
        </div>
        <span className="shrink-0 text-sm tabular-nums text-slate-500">
          {resultCount} deals
        </span>
      </div>

      <div className="flex items-center justify-between gap-3 md:hidden">
        <button
          onClick={() => setMobileOpen(true)}
          className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 min-h-[44px] text-sm text-slate-700 transition-colors hover:border-slate-300 hover:text-slate-900"
        >
          <svg
            className="h-4 w-4"
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
        <span className="text-sm tabular-nums text-slate-500">{resultCount} deals</span>
      </div>

      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-slate-200/60"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <div
            className="fixed inset-y-0 right-0 z-50 w-full max-w-sm overflow-y-auto border-l border-slate-200 bg-white p-6 md:hidden"
            role="dialog"
            aria-label="Filters"
          >
            <div className="mb-6 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">Filters</h3>
              <button
                onClick={() => setMobileOpen(false)}
                className="rounded-lg p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-500 transition-colors hover:text-slate-900"
                aria-label="Close filters"
              >
                <svg
                  className="h-5 w-5"
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

            <div className="space-y-3">
              <input
                type="search"
                value={search}
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder="Search card, set, year, tags..."
                className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none"
              />

              <select
                value={categoryFilter ?? ""}
                onChange={(event) => onCategoryChange(event.target.value || null)}
                className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 focus:border-cyan-500 focus:outline-none"
              >
                <option value="">Category</option>
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>

              <select
                value={gradeFilter ?? ""}
                onChange={(event) => onGradeChange(event.target.value || null)}
                className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 focus:border-cyan-500 focus:outline-none"
              >
                <option value="">Grade</option>
                {grades.map((grade) => (
                  <option key={grade} value={grade}>
                    {grade}
                  </option>
                ))}
              </select>

              <select
                value={priceRange}
                onChange={(event) =>
                  onPriceRangeChange(event.target.value as PriceRangeValue)
                }
                className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 focus:border-cyan-500 focus:outline-none"
              >
                {PRICE_RANGES.map((range) => (
                  <option key={range.value || "all"} value={range.value}>
                    {range.label}
                  </option>
                ))}
              </select>

              <select
                value={sort}
                onChange={(event) => onSortChange(event.target.value as SortValue)}
                className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 focus:border-cyan-500 focus:outline-none"
              >
                {SORTS.map((sortOption) => (
                  <option key={sortOption.value} value={sortOption.value}>
                    {sortOption.label}
                  </option>
                ))}
              </select>

              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800">
                <input
                  type="checkbox"
                  checked={offersOnly}
                  onChange={(event) => onOffersOnlyChange(event.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
                />
                Offers only
              </label>
            </div>

            <button
              onClick={() => setMobileOpen(false)}
              className="mt-6 w-full rounded-lg bg-cyan-600 py-3 min-h-[44px] text-sm font-medium text-white transition-colors hover:bg-cyan-500"
            >
              Apply filters
            </button>
          </div>
        </>
      )}
    </>
  );
}
