"use client";

import { useState, useMemo, useCallback } from "react";
import Link from "next/link";
import ShopStatsStrip from "./ShopStatsStrip";
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

export default function ShopStorefront({
  initialListings,
  stats,
  isAdmin,
}: ShopStorefrontProps) {
  const [search, setSearch] = useState("");
  const [sportFilter, setSportFilter] = useState<string | null>(null);
  const [gradeFilter, setGradeFilter] = useState<string | null>(null);
  const [priceRange, setPriceRange] = useState<PriceRangeValue>("");
  const [belowCmvOnly, setBelowCmvOnly] = useState(false);
  const [sort, setSort] = useState<SortValue>("newest");
  const [catalogPage, setCatalogPage] = useState(1);
  const [waitlistEmail, setWaitlistEmail] = useState("");
  const [waitlistStatus, setWaitlistStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  const sports = useMemo(() => {
    const set = new Set(initialListings.map((l) => l.sport).filter(Boolean));
    return Array.from(set).sort();
  }, [initialListings]);

  const grades = useMemo(() => {
    const set = new Set(initialListings.map((l) => l.grade).filter(Boolean));
    return Array.from(set).sort();
  }, [initialListings]);

  const searchLower = search.toLowerCase().trim();
  const catalogFiltered = useMemo(() => {
    let list = [...initialListings];

    if (searchLower) {
      const terms = searchLower.split(/\s+/);
      list = list.filter((l) => {
        const haystack = [
          l.player_name,
          l.set_brand,
          String(l.year),
          (l.tags ?? []).join(" "),
        ]
          .join(" ")
          .toLowerCase();
        return terms.every((t) => haystack.includes(t));
      });
    }
    if (sportFilter) list = list.filter((l) => l.sport === sportFilter);
    if (gradeFilter) list = list.filter((l) => l.grade === gradeFilter);
    list = applyPriceRange(list, priceRange);
    if (belowCmvOnly)
      list = list.filter((l) => l.cmv != null && l.cmv > 0 && l.price < l.cmv);

    switch (sort) {
      case "featured":
        list.sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0));
        list.sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        break;
      case "price_asc":
        list.sort((a, b) => a.price - b.price);
        break;
      case "price_desc":
        list.sort((a, b) => b.price - a.price);
        break;
      case "discount":
        list.sort((a, b) => {
          const da =
            a.cmv != null && a.cmv > 0
              ? (a.cmv - a.price) / a.cmv
              : -Infinity;
          const db =
            b.cmv != null && b.cmv > 0
              ? (b.cmv - b.price) / b.cmv
              : -Infinity;
          return db - da;
        });
        break;
      case "player":
        list.sort((a, b) => a.player_name.localeCompare(b.player_name));
        break;
      default:
        list.sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
    }
    return list;
  }, [
    initialListings,
    searchLower,
    sportFilter,
    gradeFilter,
    priceRange,
    belowCmvOnly,
    sort,
  ]);

  const PAGE_SIZE = 30;
  const catalogPageCount = Math.ceil(catalogFiltered.length / PAGE_SIZE);
  const catalogPageItems = catalogFiltered.slice(
    (catalogPage - 1) * PAGE_SIZE,
    catalogPage * PAGE_SIZE
  );

  const clearFilters = useCallback(() => {
    setSearch("");
    setSportFilter(null);
    setGradeFilter(null);
    setPriceRange("");
    setBelowCmvOnly(false);
    setCatalogPage(1);
  }, []);

  const handleWaitlistSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!waitlistEmail.trim()) return;
    setWaitlistStatus("loading");
    try {
      const res = await fetch("/api/shop/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: waitlistEmail.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setWaitlistStatus("success");
        setWaitlistEmail("");
      } else {
        setWaitlistStatus("error");
      }
    } catch {
      setWaitlistStatus("error");
    }
  };

  const isEmpty = initialListings.length === 0;

  if (isEmpty) {
    return (
      <div className="space-y-10">
        {/* Hero - minimal empty state */}
        <section className="text-center py-10">
          <h1 className="text-3xl md:text-5xl font-bold text-white">
            Authenticated Cards. Data-Driven Pricing.
          </h1>
          <p className="mt-4 text-lg text-gray-400 max-w-xl mx-auto">
            Every listing includes CardzCheck Market Value (CMV) and transparent pricing deltas.
          </p>

          <form
            onSubmit={handleWaitlistSubmit}
            className="mt-8 max-w-sm mx-auto flex flex-col sm:flex-row gap-2"
          >
            <input
              type="email"
              value={waitlistEmail}
              onChange={(e) => setWaitlistEmail(e.target.value)}
              placeholder="your@email.com"
              className="flex-1 px-4 py-3 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:border-cyan-500 focus:outline-none"
              required
            />
            <button
              type="submit"
              disabled={waitlistStatus === "loading"}
              className="px-6 py-3 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white font-medium disabled:opacity-50"
            >
              {waitlistStatus === "loading"
                ? "Joining..."
                : waitlistStatus === "success"
                ? "Joined!"
                : "Join Waitlist"}
            </button>
          </form>
          {waitlistStatus === "error" && (
            <p className="mt-2 text-sm text-red-400">Something went wrong. Try again.</p>
          )}
        </section>

        <ShopStatsStrip stats={stats} isAdmin={isAdmin} />
      </div>
    );
  }

  return (
    <div className="space-y-14">
      {/* Hero - tightened, trust chips */}
      <section className="text-center py-10">
        <h1 className="text-3xl md:text-5xl font-bold text-white">
          Authenticated Cards. Data-Driven Pricing.
        </h1>
        <p className="mt-4 text-lg text-gray-400 max-w-xl mx-auto">
          Every listing includes CardzCheck Market Value (CMV) and transparent pricing deltas.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <span className="px-3 py-1.5 rounded-full text-sm text-gray-400 border border-gray-700/60 bg-gray-800/30">
            Secure Stripe Checkout
          </span>
          <span className="px-3 py-1.5 rounded-full text-sm text-gray-400 border border-gray-700/60 bg-gray-800/30">
            Fast 1–2 Day Shipping
          </span>
          <span className="px-3 py-1.5 rounded-full text-sm text-gray-400 border border-gray-700/60 bg-gray-800/30">
            Verified Graded Slabs
          </span>
        </div>
        <Link
          href="/comps"
          className="mt-4 inline-block text-sm text-gray-500 hover:text-gray-400 transition-colors"
        >
          How CMV Works
        </Link>
      </section>

      {/* Stats */}
      <div className="mt-2">
        <ShopStatsStrip stats={stats} isAdmin={isAdmin} />
      </div>

      {/* Catalog */}
      <section id={CATALOG_ID} className="scroll-mt-8 pt-2">
        <h2 className="text-xl font-semibold text-white mb-6">Inventory</h2>

        {/* Search + Filter bar - sticky */}
        <div className="sticky top-[73px] z-20 py-4 -mx-4 px-4 md:mx-0 md:px-0 bg-[#0f1419]/95 backdrop-blur mb-6 space-y-3">
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCatalogPage(1);
            }}
            placeholder="Search player, set, year, tags..."
            className="w-full md:max-w-xs px-4 py-2 rounded-lg bg-gray-800/80 border border-gray-700/60 text-gray-300 placeholder-gray-500 focus:border-cyan-500/50 focus:outline-none text-sm"
          />
          <ShopFilterBar
            sports={sports}
            grades={grades}
            sportFilter={sportFilter}
            gradeFilter={gradeFilter}
            priceRange={priceRange}
            belowCmvOnly={belowCmvOnly}
            sort={sort}
            onSportChange={(v) => {
              setSportFilter(v);
              setCatalogPage(1);
            }}
            onGradeChange={(v) => {
              setGradeFilter(v);
              setCatalogPage(1);
            }}
            onPriceRangeChange={(v) => {
              setPriceRange(v);
              setCatalogPage(1);
            }}
            onBelowCmvChange={(v) => {
              setBelowCmvOnly(v);
              setCatalogPage(1);
            }}
            onSortChange={(v) => {
              setSort(v);
              setCatalogPage(1);
            }}
            resultCount={catalogFiltered.length}
          />
        </div>

        {catalogFiltered.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-gray-400 mb-4">No listings match your filters.</p>
            <div className="flex gap-4 justify-center">
              <button
                onClick={clearFilters}
                className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white font-medium"
              >
                Clear filters
              </button>
              <Link
                href="/shop"
                className="px-4 py-2 rounded-lg border border-gray-600 text-gray-300 hover:text-white font-medium"
              >
                Browse Featured
              </Link>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6 md:gap-8">
              {catalogPageItems.map((listing) => (
                <ShopListingCard key={listing.id} listing={listing} />
              ))}
            </div>
            {catalogPageCount > 1 && (
              <div className="mt-8 flex justify-center gap-2">
                <button
                  onClick={() => setCatalogPage((p) => Math.max(1, p - 1))}
                  disabled={catalogPage <= 1}
                  className="px-4 py-2 rounded-lg bg-gray-800 text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:text-white"
                >
                  Previous
                </button>
                <span className="px-4 py-2 text-gray-400">
                  {catalogPage} / {catalogPageCount}
                </span>
                <button
                  onClick={() =>
                    setCatalogPage((p) => Math.min(catalogPageCount, p + 1))
                  }
                  disabled={catalogPage >= catalogPageCount}
                  className="px-4 py-2 rounded-lg bg-gray-800 text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:text-white"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
