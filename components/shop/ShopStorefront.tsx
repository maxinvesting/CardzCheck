"use client";

import { useState, useMemo, useCallback } from "react";
import Link from "next/link";
import ShopStatsStrip from "./ShopStatsStrip";
import ShopSectionCarousel from "./ShopSectionCarousel";
import ShopListingCard from "./ShopListingCard";
import ShopQuickViewModal from "./ShopQuickViewModal";
import type { ShopListing } from "@/types/shop";
import type { ShopStats } from "@/lib/shop/server";

interface ShopStorefrontProps {
  initialListings: ShopListing[];
  stats: ShopStats;
  isAdmin?: boolean;
}

const SORTS = [
  { value: "featured", label: "Featured" },
  { value: "newest", label: "Newest" },
  { value: "price_asc", label: "Price: Low to High" },
  { value: "price_desc", label: "Price: High to Low" },
  { value: "discount", label: "Biggest Discount" },
  { value: "player", label: "Player A-Z" },
] as const;

const CATALOG_ID = "shop-catalog";

export default function ShopStorefront({
  initialListings,
  stats,
  isAdmin,
}: ShopStorefrontProps) {
  const [search, setSearch] = useState("");
  const [sportFilter, setSportFilter] = useState<string | null>(null);
  const [gradeFilter, setGradeFilter] = useState<string | null>(null);
  const [belowCmvOnly, setBelowCmvOnly] = useState(false);
  const [inStockOnly, setInStockOnly] = useState(false);
  const [sort, setSort] = useState<(typeof SORTS)[number]["value"]>("newest");
  const [quickViewListing, setQuickViewListing] = useState<ShopListing | null>(null);
  const [catalogPage, setCatalogPage] = useState(1);
  const [waitlistEmail, setWaitlistEmail] = useState("");
  const [waitlistStatus, setWaitlistStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  const handleBrowseInventory = () => {
    document.getElementById(CATALOG_ID)?.scrollIntoView({ behavior: "smooth" });
  };

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
    if (belowCmvOnly)
      list = list.filter((l) => l.cmv != null && l.cmv > 0 && l.price < l.cmv);
    if (inStockOnly)
      list = list.filter((l) => (l.quantity ?? 0) - (l.quantity_sold ?? 0) > 0);

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
    belowCmvOnly,
    inStockOnly,
    sort,
  ]);

  const featuredListings = useMemo(
    () => initialListings.filter((l) => l.featured),
    [initialListings]
  );

  const belowCmvListings = useMemo(() => {
    return initialListings
      .filter((l) => l.cmv != null && l.cmv > 0 && l.price < l.cmv)
      .sort((a, b) => {
        const da = (a.cmv! - a.price) / a.cmv!;
        const db = (b.cmv! - b.price) / b.cmv!;
        return db - da;
      });
  }, [initialListings]);

  const premiumListings = useMemo(
    () =>
      initialListings.filter(
        (l) => l.is_premium || (l.price ?? 0) >= 200
      ),
    [initialListings]
  );

  const newestListings = useMemo(
    () =>
      [...initialListings].sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ).slice(0, 12),
    [initialListings]
  );

  const under25Listings = useMemo(
    () => initialListings.filter((l) => l.price < 25),
    [initialListings]
  );

  const qbRookiesListings = useMemo(
    () =>
      initialListings.filter((l) => {
        const tags = (l.tags ?? []).join(" ").toLowerCase();
        return tags.includes("qb") || tags.includes("rookie");
      }),
    [initialListings]
  );

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
    setBelowCmvOnly(false);
    setInStockOnly(false);
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
        {/* Hero */}
        <section className="text-center py-16">
          <h1 className="text-3xl md:text-5xl font-bold text-white">
            Authenticated Cards. Data-Driven Pricing.
          </h1>
          <p className="mt-4 text-lg text-gray-400 max-w-xl mx-auto">
            Every listing includes CardzCheck Market Value (CMV) and pricing
            deltas.
          </p>
          <p className="mt-6 text-gray-500">No inventory live. Check back soon.</p>

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
    <div className="space-y-12">
      {/* Hero */}
      <section className="text-center py-16">
        <h1 className="text-3xl md:text-5xl font-bold text-white">
          Authenticated Cards. Data-Driven Pricing.
        </h1>
        <p className="mt-4 text-lg text-gray-400 max-w-xl mx-auto">
          Every listing includes CardzCheck Market Value (CMV) and pricing
          deltas.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
          <button
            onClick={handleBrowseInventory}
            className="px-8 py-3 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white font-semibold transition-colors"
          >
            Browse Inventory
          </button>
          <Link
            href="/comps"
            className="px-8 py-3 rounded-lg border border-gray-600 text-gray-300 hover:text-white hover:border-gray-500 font-medium transition-colors text-center"
          >
            How CMV Works
          </Link>
        </div>
        <ul className="mt-8 flex flex-wrap justify-center gap-6 text-sm text-gray-400">
          <li>Fast shipping (BMWT)</li>
          <li>Condition-first photos</li>
          <li>Secure checkout (Stripe)</li>
        </ul>
      </section>

      {/* Stats */}
      <ShopStatsStrip stats={stats} isAdmin={isAdmin} />

      {/* Merchandised Sections */}
      <ShopSectionCarousel
        title="Featured"
        listings={featuredListings}
        seeAllHref="/shop#shop-catalog"
        onQuickView={setQuickViewListing}
      />
      <ShopSectionCarousel
        title="Below CMV Deals"
        listings={belowCmvListings}
        seeAllHref="/shop#shop-catalog"
        onQuickView={setQuickViewListing}
      />
      <ShopSectionCarousel
        title="Premium"
        listings={premiumListings}
        seeAllHref="/shop#shop-catalog"
        onQuickView={setQuickViewListing}
      />
      <ShopSectionCarousel
        title="Newest Adds"
        listings={newestListings}
        onQuickView={setQuickViewListing}
      />

      {/* Bundles */}
      <ShopSectionCarousel
        title="Under $25"
        listings={under25Listings}
        seeAllHref="/shop#shop-catalog"
        onQuickView={setQuickViewListing}
      />
      <ShopSectionCarousel
        title="QB Rookies"
        listings={qbRookiesListings}
        seeAllHref="/shop#shop-catalog"
        onQuickView={setQuickViewListing}
      />

      {/* Full Catalog */}
      <section id={CATALOG_ID} className="scroll-mt-8">
        <h2 className="text-xl font-semibold text-white mb-4">Full Catalog</h2>

        {/* Search + Filters - sticky on mobile */}
        <div className="sticky top-[73px] z-20 py-4 -mx-4 px-4 md:mx-0 md:px-0 bg-[#0f1419]/95 backdrop-blur mb-6 space-y-4">
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCatalogPage(1);
            }}
            placeholder="Search player, set, year, tags..."
            className="w-full px-4 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:border-cyan-500 focus:outline-none"
          />
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setBelowCmvOnly(!belowCmvOnly)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                belowCmvOnly
                  ? "bg-cyan-600 text-white"
                  : "bg-gray-800 text-gray-400 hover:text-white"
              }`}
            >
              Below CMV only
            </button>
            <button
              onClick={() => setInStockOnly(!inStockOnly)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                inStockOnly
                  ? "bg-cyan-600 text-white"
                  : "bg-gray-800 text-gray-400 hover:text-white"
              }`}
            >
              In stock
            </button>
            {sports.map((s) => (
              <button
                key={s}
                onClick={() => {
                  setSportFilter(sportFilter === s ? null : s);
                  setCatalogPage(1);
                }}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  sportFilter === s
                    ? "bg-cyan-600 text-white"
                    : "bg-gray-800 text-gray-400 hover:text-white"
                }`}
              >
                {s}
              </button>
            ))}
            {grades.slice(0, 6).map((g) => (
              <button
                key={g}
                onClick={() => {
                  setGradeFilter(gradeFilter === g ? null : g);
                  setCatalogPage(1);
                }}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  gradeFilter === g
                    ? "bg-cyan-600 text-white"
                    : "bg-gray-800 text-gray-400 hover:text-white"
                }`}
              >
                {g}
              </button>
            ))}
            <select
              value={sort}
              onChange={(e) => {
                setSort(e.target.value as (typeof SORTS)[number]["value"]);
                setCatalogPage(1);
              }}
              className="px-3 py-1.5 rounded-lg bg-gray-800 text-gray-300 text-sm border border-gray-700 focus:border-cyan-500 focus:outline-none"
            >
              {SORTS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
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
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
              {catalogPageItems.map((listing) => (
                <ShopListingCard
                  key={listing.id}
                  listing={listing}
                  onQuickView={setQuickViewListing}
                />
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

      <ShopQuickViewModal
        listing={quickViewListing}
        isOpen={!!quickViewListing}
        onClose={() => setQuickViewListing(null)}
      />
    </div>
  );
}
