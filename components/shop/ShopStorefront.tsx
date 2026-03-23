"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import ShopListingCard from "./ShopListingCard";
import ShopFilterBar, {
  type SortValue,
  type PriceRangeValue,
} from "./ShopFilterBar";
import type { ShopListing } from "@/types/shop";
import type { ShopStats } from "@/lib/shop/server";

interface ShopStorefrontProps {
  initialListings: ShopListing[];
  stats: ShopStats;
  isAdmin?: boolean;
  isBusiness?: boolean;
}

const CATALOG_ID = "shop-catalog";
const PAGE_SIZE = 24;

function applyPriceRange(
  list: ShopListing[],
  range: PriceRangeValue
): ShopListing[] {
  if (!range) return list;
  if (range === "0-25") return list.filter((l) => l.price < 25);
  if (range === "25-50")
    return list.filter((l) => l.price >= 25 && l.price < 50);
  if (range === "50-100")
    return list.filter((l) => l.price >= 50 && l.price < 100);
  if (range === "100-200")
    return list.filter((l) => l.price >= 100 && l.price < 200);
  if (range === "200+") return list.filter((l) => l.price >= 200);
  return list;
}

function sortListings(list: ShopListing[], sort: SortValue) {
  switch (sort) {
    case "price_asc":
      list.sort((a, b) => a.price - b.price);
      break;
    case "price_desc":
      list.sort((a, b) => b.price - a.price);
      break;
    default:
      list.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
  }
}

export default function ShopStorefront({
  initialListings,
  stats,
  isAdmin,
  isBusiness = false,
}: ShopStorefrontProps) {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [gradeFilter, setGradeFilter] = useState<string | null>(null);
  const [priceRange, setPriceRange] = useState<PriceRangeValue>("");
  const [sort, setSort] = useState<SortValue>("newest");
  const [catalogPage, setCatalogPage] = useState(1);

  const categories = useMemo(() => {
    const categorySet = new Set(initialListings.map((l) => l.sport).filter(Boolean));
    return Array.from(categorySet).sort();
  }, [initialListings]);

  const grades = useMemo(() => {
    const gradeSet = new Set(initialListings.map((l) => l.grade).filter(Boolean));
    return Array.from(gradeSet).sort();
  }, [initialListings]);

  const searchLower = search.toLowerCase().trim();
  const catalogFiltered = useMemo(() => {
    let list = [...initialListings];

    if (searchLower) {
      const terms = searchLower.split(/\s+/);
      list = list.filter((listing) => {
        const haystack = [
          listing.title,
          listing.player_name,
          listing.set_brand,
          String(listing.year),
          (listing.tags ?? []).join(" "),
        ]
          .join(" ")
          .toLowerCase();

        return terms.every((term) => haystack.includes(term));
      });
    }

    if (categoryFilter) {
      list = list.filter((listing) => listing.sport === categoryFilter);
    }

    if (gradeFilter) {
      list = list.filter((listing) => listing.grade === gradeFilter);
    }

    list = applyPriceRange(list, priceRange);
    sortListings(list, sort);
    return list;
  }, [initialListings, searchLower, categoryFilter, gradeFilter, priceRange, sort]);

  const catalogPageCount = Math.max(
    1,
    Math.ceil(catalogFiltered.length / PAGE_SIZE)
  );
  const catalogPageItems = catalogFiltered.slice(
    (catalogPage - 1) * PAGE_SIZE,
    catalogPage * PAGE_SIZE
  );

  const hasActiveFilters =
    Boolean(search) ||
    Boolean(categoryFilter) ||
    Boolean(gradeFilter) ||
    Boolean(priceRange) ||
    sort !== "newest";

  const clearFilters = useCallback(() => {
    setSearch("");
    setCategoryFilter(null);
    setGradeFilter(null);
    setPriceRange("");
    setSort("newest");
    setCatalogPage(1);
  }, []);

  const scrollToCatalog = useCallback(() => {
    const catalog = document.getElementById(CATALOG_ID);
    if (catalog) {
      catalog.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  const isEmpty = initialListings.length === 0;
  const heroBadges = ["Below Comps", "eBay-Verified Pricing", "New Drops"];

  return (
    <div className="space-y-0">
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-10 md:py-12">
          <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-cyan-50/50 p-6 md:p-9">
            <div className="flex flex-wrap gap-2">
              {heroBadges.map((badge) => (
                <span
                  key={badge}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600"
                >
                  {badge}
                </span>
              ))}
            </div>

            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">
              CardzCheck Deals
            </h1>
            <p className="mt-3 max-w-3xl text-slate-600">
              Curated sports card deals from CardzCheck inventory, priced
              competitively and often below market comps.
            </p>
            <p className="mt-2 max-w-3xl text-sm text-slate-500">
              All listings are published by CardzCheck. This is a buyer-focused
              storefront, not a peer-to-peer marketplace.
            </p>

            {!isEmpty && (
              <p className="mt-4 text-sm text-slate-500">
                {stats.activeCount} live deals
              </p>
            )}
            {!isEmpty && (
              <button
                onClick={scrollToCatalog}
                className="mt-5 rounded-lg bg-cyan-600 px-5 py-3 min-h-[44px] text-sm font-medium text-white transition-colors hover:bg-cyan-500"
              >
                Browse live deals
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Business free-shipping banner */}
      {isBusiness && (
        <section className="border-b border-cyan-100 bg-cyan-50 px-4 py-2.5">
          <div className="mx-auto flex max-w-7xl items-center gap-2 text-sm text-cyan-800">
            <svg className="h-4 w-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
            </svg>
            <span>
              <strong className="font-semibold">Business plan active</strong> — free shipping applied to every order automatically.
            </span>
          </div>
        </section>
      )}

      {/* Loyalty perks info */}
      <section className="border-b border-slate-100 bg-slate-50 px-4 py-3">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-1 text-xs text-slate-500">
          <span className="font-medium text-slate-700">Repeat Buyer Perks</span>
          <span>Every 15th purchase = <strong className="text-slate-700">5% off</strong> your order (15, 30, 45…)</span>
          {isBusiness && <span>Business members also get <strong className="text-slate-700">free shipping</strong> on all orders.</span>}
        </div>
      </section>

      <section
        id={CATALOG_ID}
        className="scroll-mt-28 border-b border-slate-200 bg-white"
      >
        <div className="mx-auto max-w-7xl space-y-6 px-4 py-12">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-2xl font-semibold text-slate-900">Live Deals</h2>
              <p className="mt-1 text-sm text-slate-500">
                Published by CardzCheck from in-house inventory.
              </p>
            </div>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="text-sm text-slate-600 transition-colors hover:text-cyan-700 min-h-[44px] px-1"
              >
                Reset filters
              </button>
            )}
          </div>

          {isEmpty ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-6 py-10 text-center">
              <p className="font-medium text-slate-900">No live deals right now.</p>
              <p className="mx-auto mt-2 max-w-xl text-sm text-slate-600">
                New deals appear here as CardzCheck publishes them. Check back
                soon for fresh below-comps listings.
              </p>
              <div className="mt-5 flex flex-wrap items-center justify-center gap-4">
                <Link
                  href="/"
                  className="text-sm text-slate-600 transition-colors hover:text-cyan-700"
                >
                  Return to Main App
                </Link>
                {isAdmin && (
                  <Link
                    href="/admin/shop"
                    className="text-sm text-slate-600 transition-colors hover:text-cyan-700"
                  >
                    Publish deals in Shop Admin
                  </Link>
                )}
              </div>
            </div>
          ) : (
            <>
              <ShopFilterBar
                search={search}
                categories={categories}
                grades={grades}
                categoryFilter={categoryFilter}
                gradeFilter={gradeFilter}
                priceRange={priceRange}
                sort={sort}
                onSearchChange={(value) => {
                  setSearch(value);
                  setCatalogPage(1);
                }}
                onCategoryChange={(value) => {
                  setCategoryFilter(value);
                  setCatalogPage(1);
                }}
                onGradeChange={(value) => {
                  setGradeFilter(value);
                  setCatalogPage(1);
                }}
                onPriceRangeChange={(value) => {
                  setPriceRange(value);
                  setCatalogPage(1);
                }}
                onSortChange={(value) => {
                  setSort(value);
                  setCatalogPage(1);
                }}
                resultCount={catalogFiltered.length}
              />

              {catalogFiltered.length === 0 ? (
                <div className="border-t border-slate-200 py-14 text-center">
                  <p className="text-slate-600">No deals match these filters.</p>
                  <button
                    onClick={clearFilters}
                    className="mt-4 rounded-lg bg-cyan-600 px-4 py-2.5 min-h-[44px] text-sm font-medium text-white transition-colors hover:bg-cyan-500"
                  >
                    Clear filters
                  </button>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {catalogPageItems.map((listing) => (
                      <ShopListingCard key={listing.id} listing={listing} />
                    ))}
                  </div>

                  {catalogPageCount > 1 && (
                    <div className="flex items-center justify-center gap-2 pt-2">
                      <button
                        onClick={() => setCatalogPage((page) => Math.max(1, page - 1))}
                        disabled={catalogPage <= 1}
                        className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 min-h-[44px] text-sm text-slate-700 transition-colors hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Previous
                      </button>
                      <span className="px-3 text-sm tabular-nums text-slate-500">
                        {catalogPage} / {catalogPageCount}
                      </span>
                      <button
                        onClick={() =>
                          setCatalogPage((page) => Math.min(catalogPageCount, page + 1))
                        }
                        disabled={catalogPage >= catalogPageCount}
                        className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 min-h-[44px] text-sm text-slate-700 transition-colors hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Next
                      </button>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
