"use client";

import { useCallback, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import ShopStatsStrip from "./ShopStatsStrip";
import ShopListingCard from "./ShopListingCard";
import ShopFilterBar, {
  type SortValue,
  type PriceRangeValue,
} from "./ShopFilterBar";
import ShopSectionCarousel from "./ShopSectionCarousel";
import type { ShopListing } from "@/types/shop";
import type { ShopStats } from "@/lib/shop/server";

interface ShopStorefrontProps {
  initialListings: ShopListing[];
  stats: ShopStats;
  isAdmin?: boolean;
}

type MerchandisingPreset = "featured" | "below-cmv" | "premium";

const CATALOG_ID = "shop-catalog";
const PAGE_SIZE = 24;
const CURATED_ROW_SIZE = 8;

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

function discountRatio(listing: ShopListing): number {
  if (listing.cmv == null || listing.cmv <= 0) return -Infinity;
  return (listing.cmv - listing.price) / listing.cmv;
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
  const [waitlistStatus, setWaitlistStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");

  const sports = useMemo(() => {
    const sportSet = new Set(initialListings.map((l) => l.sport).filter(Boolean));
    return Array.from(sportSet).sort();
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

    if (sportFilter) {
      list = list.filter((listing) => listing.sport === sportFilter);
    }

    if (gradeFilter) {
      list = list.filter((listing) => listing.grade === gradeFilter);
    }

    list = applyPriceRange(list, priceRange);

    if (belowCmvOnly) {
      list = list.filter(
        (listing) =>
          listing.cmv != null && listing.cmv > 0 && listing.price < listing.cmv
      );
    }

    switch (sort) {
      case "featured":
        list.sort((a, b) => {
          const featuredDelta = Number(b.featured) - Number(a.featured);
          if (featuredDelta !== 0) return featuredDelta;
          return (
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          );
        });
        break;
      case "price_asc":
        list.sort((a, b) => a.price - b.price);
        break;
      case "price_desc":
        list.sort((a, b) => b.price - a.price);
        break;
      case "discount":
        list.sort((a, b) => discountRatio(b) - discountRatio(a));
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

  const catalogPageCount = Math.max(1, Math.ceil(catalogFiltered.length / PAGE_SIZE));
  const catalogPageItems = catalogFiltered.slice(
    (catalogPage - 1) * PAGE_SIZE,
    catalogPage * PAGE_SIZE
  );

  const featuredListings = useMemo(
    () => initialListings.filter((listing) => listing.featured).slice(0, CURATED_ROW_SIZE),
    [initialListings]
  );

  const belowCmvDeals = useMemo(
    () =>
      [...initialListings]
        .filter(
          (listing) =>
            listing.cmv != null && listing.cmv > 0 && listing.price < listing.cmv
        )
        .sort((a, b) => discountRatio(b) - discountRatio(a))
        .slice(0, CURATED_ROW_SIZE),
    [initialListings]
  );

  const premiumListings = useMemo(
    () =>
      [...initialListings]
        .filter((listing) => listing.price >= 200 || listing.is_premium)
        .sort((a, b) => b.price - a.price)
        .slice(0, CURATED_ROW_SIZE),
    [initialListings]
  );

  const hasActiveFilters =
    Boolean(search) ||
    Boolean(sportFilter) ||
    Boolean(gradeFilter) ||
    Boolean(priceRange) ||
    belowCmvOnly ||
    sort !== "newest";

  const clearFilters = useCallback(() => {
    setSearch("");
    setSportFilter(null);
    setGradeFilter(null);
    setPriceRange("");
    setBelowCmvOnly(false);
    setSort("newest");
    setCatalogPage(1);
  }, []);

  const scrollToCatalog = useCallback(() => {
    const catalog = document.getElementById(CATALOG_ID);
    if (catalog) {
      catalog.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  const applyMerchandisingPreset = useCallback(
    (preset: MerchandisingPreset) => {
      setSearch("");
      setSportFilter(null);
      setGradeFilter(null);
      setCatalogPage(1);

      if (preset === "featured") {
        setPriceRange("");
        setBelowCmvOnly(false);
        setSort("featured");
      }

      if (preset === "below-cmv") {
        setPriceRange("");
        setBelowCmvOnly(true);
        setSort("discount");
      }

      if (preset === "premium") {
        setPriceRange("200+");
        setBelowCmvOnly(false);
        setSort("price_desc");
      }

      scrollToCatalog();
    },
    [scrollToCatalog]
  );

  const handleWaitlistSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!waitlistEmail.trim()) return;

    setWaitlistStatus("loading");

    try {
      const response = await fetch("/api/shop/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: waitlistEmail.trim() }),
      });

      if (response.ok) {
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
      <div className="space-y-8 md:space-y-10">
        <section className="mx-auto max-w-2xl py-8 text-center md:py-10">
          <p className="text-xs uppercase tracking-[0.2em] text-cyan-300/80">CardzCheck Shop</p>
          <h1 className="mt-3 text-3xl font-semibold text-white md:text-4xl">
            Curated cards are landing soon.
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base text-slate-400 md:text-lg">
            We launch inventory in tight drops with full CMV transparency and verified
            condition details. Join the waitlist for first access.
          </p>

          <form
            onSubmit={handleWaitlistSubmit}
            className="mx-auto mt-7 flex max-w-md flex-col gap-2 sm:flex-row"
          >
            <input
              type="email"
              value={waitlistEmail}
              onChange={(event) => setWaitlistEmail(event.target.value)}
              placeholder="your@email.com"
              className="flex-1 rounded-lg border border-slate-700 bg-slate-900/80 px-4 py-3 text-white placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none"
              required
            />
            <button
              type="submit"
              disabled={waitlistStatus === "loading"}
              className="rounded-lg bg-cyan-600 px-6 py-3 font-medium text-white transition-colors hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {waitlistStatus === "loading"
                ? "Joining..."
                : waitlistStatus === "success"
                ? "Joined"
                : "Join waitlist"}
            </button>
          </form>

          {waitlistStatus === "error" && (
            <p className="mt-3 text-sm text-rose-400">
              Something went wrong while joining the waitlist.
            </p>
          )}
        </section>

        <ShopStatsStrip stats={stats} isAdmin={isAdmin} compact />
      </div>
    );
  }

  return (
    <div className="space-y-10 md:space-y-12">
      <section className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-cyan-300/80">CardzCheck Shop</p>
            <h1 className="mt-2 text-3xl font-semibold text-white md:text-4xl">
              Curated inventory. Transparent pricing.
            </h1>
          </div>
          <Link
            href="/comps"
            className="text-sm font-medium text-slate-400 transition-colors hover:text-cyan-300"
          >
            How CMV works
          </Link>
        </div>

        <div className="flex flex-wrap gap-2">
          <span className="rounded-full border border-slate-700 bg-slate-900/70 px-3 py-1.5 text-xs text-slate-300">
            Secure Stripe Checkout
          </span>
          <span className="rounded-full border border-slate-700 bg-slate-900/70 px-3 py-1.5 text-xs text-slate-300">
            Ships in 1-2 days
          </span>
          <span className="rounded-full border border-slate-700 bg-slate-900/70 px-3 py-1.5 text-xs text-slate-300">
            Verified slabs + raw
          </span>
        </div>

        <ShopStatsStrip stats={stats} isAdmin={isAdmin} compact />
      </section>

      <section className="space-y-8">
        <ShopSectionCarousel
          title="Featured"
          subtitle="Handpicked cards from current inventory"
          listings={featuredListings}
          onSeeAll={() => applyMerchandisingPreset("featured")}
        />

        <ShopSectionCarousel
          title="Below CMV deals"
          subtitle="Best discounts versus CardzCheck Market Value"
          listings={belowCmvDeals}
          onSeeAll={() => applyMerchandisingPreset("below-cmv")}
        />

        <ShopSectionCarousel
          title="Premium"
          subtitle="High-end slabs and flagship cards"
          listings={premiumListings}
          onSeeAll={() => applyMerchandisingPreset("premium")}
        />
      </section>

      <section id={CATALOG_ID} className="scroll-mt-28 space-y-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold text-white">Full catalog</h2>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="text-sm text-slate-400 transition-colors hover:text-cyan-300"
            >
              Reset filters
            </button>
          )}
        </div>

        <div className="space-y-3 rounded-2xl border border-slate-800/80 bg-slate-950/40 p-4 md:p-5">
          <input
            type="search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setCatalogPage(1);
            }}
            placeholder="Search player, set, year, tags..."
            className="w-full rounded-lg border border-slate-700/80 bg-slate-900/80 px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none md:max-w-sm"
          />

          <ShopFilterBar
            sports={sports}
            grades={grades}
            sportFilter={sportFilter}
            gradeFilter={gradeFilter}
            priceRange={priceRange}
            belowCmvOnly={belowCmvOnly}
            sort={sort}
            onSportChange={(value) => {
              setSportFilter(value);
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
            onBelowCmvChange={(value) => {
              setBelowCmvOnly(value);
              setCatalogPage(1);
            }}
            onSortChange={(value) => {
              setSort(value);
              setCatalogPage(1);
            }}
            resultCount={catalogFiltered.length}
          />
        </div>

        {catalogFiltered.length === 0 ? (
          <div className="rounded-2xl border border-slate-800/80 bg-slate-950/40 py-14 text-center">
            <p className="text-slate-400">No listings match these filters.</p>
            <div className="mt-4 flex items-center justify-center gap-3">
              <button
                onClick={clearFilters}
                className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-cyan-500"
              >
                Clear filters
              </button>
              <button
                onClick={() => applyMerchandisingPreset("featured")}
                className="rounded-lg border border-slate-600 px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:border-slate-400 hover:text-white"
              >
                View featured
              </button>
            </div>
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
                  className="rounded-lg border border-slate-700 bg-slate-900/70 px-4 py-2 text-sm text-slate-200 transition-colors hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Previous
                </button>
                <span className="px-3 text-sm text-slate-400 tabular-nums">
                  {catalogPage} / {catalogPageCount}
                </span>
                <button
                  onClick={() =>
                    setCatalogPage((page) => Math.min(catalogPageCount, page + 1))
                  }
                  disabled={catalogPage >= catalogPageCount}
                  className="rounded-lg border border-slate-700 bg-slate-900/70 px-4 py-2 text-sm text-slate-200 transition-colors hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-50"
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
