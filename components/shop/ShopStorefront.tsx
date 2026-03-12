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

  return (
    <div className="space-y-0">
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-12">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">
            CardzCheck Marketplace
          </h1>
          <p className="mt-2 text-slate-600">Simple storefront for available listings.</p>
          {!isEmpty && (
            <p className="mt-1 text-sm text-slate-500">
              {stats.activeCount} active listings
            </p>
          )}
          {!isEmpty && (
            <button
              onClick={scrollToCatalog}
              className="mt-5 rounded-lg bg-cyan-600 px-5 py-3 min-h-[44px] text-sm font-medium text-white transition-colors hover:bg-cyan-500"
            >
              Browse listings
            </button>
          )}
        </div>
      </section>

      <section
        id={CATALOG_ID}
        className="scroll-mt-28 border-b border-slate-200 bg-white"
      >
        <div className="mx-auto max-w-7xl space-y-6 px-4 py-12">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-2xl font-semibold text-slate-900">Listings</h2>
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
              <p className="text-slate-700">No listings are available right now.</p>
              {isAdmin && (
                <Link
                  href="/admin/shop"
                  className="mt-4 inline-block text-sm text-slate-600 transition-colors hover:text-cyan-700"
                >
                  Add listings in Marketplace Admin
                </Link>
              )}
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
                  <p className="text-slate-600">No listings match these filters.</p>
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
