"use client";

import { useCallback, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
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

interface Tile {
  title: string;
  description: string;
  iconPath: string;
}

const CATALOG_ID = "shop-catalog";
const FIRST_ACCESS_ID = "first-access";
const PAGE_SIZE = 24;
const CURATED_ROW_SIZE = 8;
const SKELETON_COUNT = 8;

const EMPTY_TILES: Tile[] = [
  {
    title: "Slabs",
    description: "Top graded cards with clean cert details.",
    iconPath:
      "M4.5 6.75A2.25 2.25 0 016.75 4.5h10.5a2.25 2.25 0 012.25 2.25v10.5A2.25 2.25 0 0117.25 19.5H6.75a2.25 2.25 0 01-2.25-2.25V6.75z",
  },
  {
    title: "Singles",
    description: "Collector-grade singles priced to move.",
    iconPath:
      "M3.75 7.5A2.25 2.25 0 016 5.25h12A2.25 2.25 0 0120.25 7.5v9A2.25 2.25 0 0118 18.75H6a2.25 2.25 0 01-2.25-2.25v-9z",
  },
  {
    title: "Sealed",
    description: "Premium wax and sealed releases when available.",
    iconPath:
      "M12 3l8.25 4.5L12 12 3.75 7.5 12 3zm8.25 4.5V16.5L12 21l-8.25-4.5V7.5",
  },
  {
    title: "Deals below CMV",
    description: "Clear discounts versus current market value.",
    iconPath:
      "M5.25 8.25h13.5M6.75 12h10.5M8.25 15.75h7.5M6 3.75h12A2.25 2.25 0 0120.25 6v12A2.25 2.25 0 0118 20.25H6A2.25 2.25 0 013.75 18V6A2.25 2.25 0 016 3.75z",
  },
];

const TRUST_CHIPS = [
  "Secure checkout",
  "Fast shipping",
  "Condition-first photos",
  "CMV transparency",
];

const TOP_TRUST_CHIPS = [
  "Secure checkout",
  "Fast shipping",
  "CMV transparency",
];

const WAITLIST_BULLETS = [
  "Drops 1-2x/week",
  "Verified condition photos",
  "CMV included",
];

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

function trustChip(label: string) {
  return (
    <span
      key={label}
      className="rounded-full border border-slate-700/80 bg-slate-900/70 px-3 py-1.5 text-xs text-slate-200"
    >
      {label}
    </span>
  );
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

  const catalogPageCount = Math.max(
    1,
    Math.ceil(catalogFiltered.length / PAGE_SIZE)
  );
  const catalogPageItems = catalogFiltered.slice(
    (catalogPage - 1) * PAGE_SIZE,
    catalogPage * PAGE_SIZE
  );

  const featuredListings = useMemo(
    () =>
      initialListings
        .filter((listing) => listing.featured)
        .slice(0, CURATED_ROW_SIZE),
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

  const scrollToFirstAccess = useCallback(() => {
    const target = document.getElementById(FIRST_ACCESS_ID);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
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
      <div className="space-y-8 md:space-y-9">
        <section className="relative overflow-hidden rounded-3xl border border-slate-800/80 bg-slate-950/80">
          <img
            src="/shop/hero-bg.png"
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full object-cover opacity-[0.14]"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-slate-900/20 via-slate-950/70 to-slate-950/95" />

          <div className="relative space-y-4 p-3 sm:p-4 md:p-6">
            <div className="flex min-h-[46px] items-center justify-between gap-3 rounded-xl border border-cyan-500/25 bg-slate-900/80 px-3 text-xs text-slate-200">
              <span className="font-medium uppercase tracking-[0.16em] text-cyan-300">
                Next Drop
              </span>
              <span className="hidden text-slate-300 sm:inline">
                Curated singles &amp; slabs with CMV transparency
              </span>
              <button
                onClick={scrollToFirstAccess}
                className="rounded-md bg-cyan-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-cyan-500"
              >
                Join waitlist
              </button>
            </div>

            <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,400px)_1fr]">
              <article
                id={FIRST_ACCESS_ID}
                className="rounded-2xl border border-slate-800/90 bg-slate-950/80 p-5"
              >
                <p className="text-xs uppercase tracking-[0.16em] text-cyan-300/90">
                  Get first access
                </p>
                <h1 className="mt-2 text-2xl font-semibold text-white">
                  Boutique drops, released in tight windows.
                </h1>
                <p className="mt-2 text-sm text-slate-400">
                  Join the waitlist for first look access to each drop and new featured
                  inventory.
                </p>

                <form
                  onSubmit={handleWaitlistSubmit}
                  className="mt-5 flex flex-col gap-2 sm:flex-row"
                >
                  <input
                    type="email"
                    value={waitlistEmail}
                    onChange={(event) => setWaitlistEmail(event.target.value)}
                    placeholder="you@email.com"
                    className="h-11 flex-1 rounded-lg border border-slate-700/80 bg-slate-900/90 px-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none"
                    required
                  />
                  <button
                    type="submit"
                    disabled={waitlistStatus === "loading"}
                    className="h-11 rounded-lg bg-cyan-600 px-5 text-sm font-medium text-white transition-colors hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-60"
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

                <ul className="mt-5 space-y-2 text-sm text-slate-300">
                  {WAITLIST_BULLETS.map((bullet) => (
                    <li key={bullet} className="flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
                      {bullet}
                    </li>
                  ))}
                </ul>
              </article>

              <article className="rounded-2xl border border-slate-800/90 bg-slate-950/70 p-5">
                <p className="text-xs uppercase tracking-[0.16em] text-cyan-300/90">
                  What you'll find
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {EMPTY_TILES.map((tile) => (
                    <div
                      key={tile.title}
                      className="rounded-xl border border-slate-800/80 bg-slate-900/70 p-4"
                    >
                      <svg
                        className="h-5 w-5 text-cyan-300"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.6}
                          d={tile.iconPath}
                        />
                      </svg>
                      <h3 className="mt-3 text-sm font-medium text-white">{tile.title}</h3>
                      <p className="mt-1 text-xs leading-5 text-slate-400">
                        {tile.description}
                      </p>
                    </div>
                  ))}
                </div>
              </article>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-white">Featured (coming soon)</h2>
              <p className="mt-1 text-sm text-slate-400">
                Inventory preview for the next live drop.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: SKELETON_COUNT }).map((_, index) => (
              <ShopListingCard key={`skeleton-${index}`} skeleton />
            ))}
          </div>
        </section>

        <section className="flex flex-wrap gap-2.5">
          {TRUST_CHIPS.map((chip) => trustChip(chip))}
        </section>

        {isAdmin && (
          <div className="pt-1">
            <Link
              href="/admin/shop"
              className="text-sm text-slate-400 transition-colors hover:text-cyan-300"
            >
              Add listings in Admin
            </Link>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-8 md:space-y-9">
      <section className="rounded-2xl border border-slate-800/80 bg-slate-950/70 p-4 md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-white md:text-3xl">CardzCheck Shop</h1>
            <p className="mt-1.5 text-sm text-slate-400">
              {stats.activeCount} active listings with CMV market pricing context.
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Prices are benchmarked against CardzCheck Market Value.{" "}
              <Link
                href="/comps"
                className="text-slate-400 transition-colors hover:text-cyan-300"
              >
                Learn how CMV works
              </Link>
              .
            </p>
          </div>

          <div className="flex flex-wrap gap-2">{TOP_TRUST_CHIPS.map((chip) => trustChip(chip))}</div>
        </div>
      </section>

      <section className="space-y-7">
        <ShopSectionCarousel
          title="Featured"
          subtitle="Featured inventory from the current drop."
          listings={featuredListings}
          onSeeAll={() => applyMerchandisingPreset("featured")}
        />

        <ShopSectionCarousel
          title="Below CMV deals"
          subtitle="Sorted by largest discount to market value."
          listings={belowCmvDeals}
          onSeeAll={() => applyMerchandisingPreset("below-cmv")}
        />

        <ShopSectionCarousel
          title="Premium"
          subtitle="High-end slabs and flagship cards."
          listings={premiumListings}
          onSeeAll={() => applyMerchandisingPreset("premium")}
        />
      </section>

      <section id={CATALOG_ID} className="scroll-mt-28 space-y-4">
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
          <ShopFilterBar
            search={search}
            sports={sports}
            grades={grades}
            sportFilter={sportFilter}
            gradeFilter={gradeFilter}
            priceRange={priceRange}
            belowCmvOnly={belowCmvOnly}
            sort={sort}
            onSearchChange={(value) => {
              setSearch(value);
              setCatalogPage(1);
            }}
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
                <span className="px-3 text-sm tabular-nums text-slate-400">
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
