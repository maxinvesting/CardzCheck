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

const CATALOG_ID = "shop-catalog";
const WAITLIST_ID = "shop-waitlist";
const PAGE_SIZE = 24;
const CURATED_ROW_SIZE = 8;
const SKELETON_COUNT = 8;

const EMPTY_FEATURES = [
  {
    title: "Verified slabs",
    description: "High-resolution photos and cert-forward listing details.",
  },
  {
    title: "Transparent CMV pricing",
    description: "Live CardzCheck Market Value context shown on every listing.",
  },
  {
    title: "Fast shipping",
    description: "Orders packed securely and shipped quickly with tracking.",
  },
] as const;

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

  const scrollToWaitlist = useCallback(() => {
    const target = document.getElementById(WAITLIST_ID);
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

  return (
    <div className="space-y-0">
      <section className="relative overflow-hidden border-b border-slate-200 bg-white">
        <div className="absolute inset-0 bg-gradient-to-r from-white via-white/96 to-slate-100/80" />

        <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 py-14 lg:grid-cols-[1.1fr_0.9fr] lg:py-20">
          <div className="max-w-2xl space-y-5">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              CardzCheck Shop
            </p>

            {isEmpty ? (
              <>
                <h1 className="text-4xl font-semibold tracking-tight text-slate-900 md:text-5xl">
                  Next drop landing soon.
                </h1>
                <p className="text-base text-slate-600 md:text-lg">
                  Join the waitlist for early access.
                </p>
              </>
            ) : (
              <>
                <h1 className="text-4xl font-semibold tracking-tight text-slate-900 md:text-5xl">
                  Curated slabs. Data-backed pricing.
                </h1>
                <p className="text-base text-slate-600 md:text-lg">
                  Each card includes live CardzCheck Market Value (CMV) and transparent deltas.
                </p>
                <p className="text-sm text-slate-500">
                  {stats.activeCount} active listings with transparent market context.
                </p>
              </>
            )}

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                onClick={scrollToCatalog}
                className="rounded-lg bg-cyan-600 px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-cyan-500"
              >
                Browse inventory
              </button>
              <button
                onClick={scrollToWaitlist}
                className="rounded-lg border border-slate-300 bg-white px-5 py-3 text-sm font-medium text-slate-700 transition-colors hover:border-slate-400 hover:text-slate-900"
              >
                Join waitlist
              </button>
            </div>
          </div>

          <div className="relative hidden h-full min-h-[360px] overflow-hidden rounded-3xl bg-slate-950 lg:block">
            {/* Deep navy backdrop */}
            <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950" />

            {/* Soft cyan spotlight, inspired by slab lighting */}
            <div className="absolute -right-10 top-10 h-56 w-56 rounded-full bg-cyan-500/35 blur-3xl" />
            <div className="absolute -left-16 bottom-0 h-48 w-48 rounded-full bg-sky-500/25 blur-3xl" />

            {/* Blurred slab silhouettes */}
            <div className="absolute -left-6 bottom-4 h-52 w-32 rounded-xl border border-slate-600/40 bg-slate-900/80 shadow-[0_0_40px_rgba(15,23,42,0.7)] blur-[1px]" />
            <div className="absolute left-16 bottom-10 h-56 w-34 rounded-xl border border-slate-500/45 bg-slate-900/90 shadow-[0_0_38px_rgba(15,23,42,0.6)] blur-[1.5px]" />
            <div className="absolute left-32 bottom-16 h-60 w-36 rounded-xl border border-slate-400/45 bg-slate-900/95 shadow-[0_0_42px_rgba(15,23,42,0.75)] blur-[2px]" />

            {/* Far background slabs */}
            <div className="absolute right-6 top-10 h-40 w-26 rounded-lg border border-slate-700/40 bg-slate-900/80 blur-[1.5px]" />
            <div className="absolute right-20 bottom-16 h-44 w-28 rounded-lg border border-slate-600/35 bg-slate-900/85 blur-[1.5px]" />

            {/* Fine noise overlay to keep it from feeling flat */}
            <div
              className="absolute inset-0 opacity-[0.18]"
              style={{
                backgroundImage:
                  "radial-gradient(circle at 0 0, rgba(148,163,184,0.24) 0, transparent 50%), radial-gradient(circle at 100% 100%, rgba(15,23,42,0.9) 0, transparent 55%)",
              }}
            />
          </div>
        </div>
      </section>

      <section id={WAITLIST_ID} className="mx-auto max-w-7xl border-b border-slate-200 px-4 py-12">
        <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Get first access
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">
              Join the next release window.
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-slate-600 md:text-base">
              Get early notice on incoming inventory, certified slabs, and below-CMV opportunities.
            </p>
          </div>

          <form
            onSubmit={handleWaitlistSubmit}
            className="flex w-full max-w-xl flex-col gap-2 sm:flex-row"
          >
            <input
              type="email"
              value={waitlistEmail}
              onChange={(event) => setWaitlistEmail(event.target.value)}
              placeholder="you@email.com"
              className="h-11 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none"
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
        </div>

        {waitlistStatus === "error" && (
          <p className="mt-3 text-sm text-rose-600">
            Something went wrong while joining the waitlist.
          </p>
        )}
      </section>

      {isEmpty ? (
        <>
          <section className="mx-auto max-w-7xl px-4 py-12">
            <div className="grid gap-5 md:grid-cols-3">
              {EMPTY_FEATURES.map((feature) => (
                <article key={feature.title} className="space-y-2">
                  <h3 className="text-lg font-semibold text-slate-900">{feature.title}</h3>
                  <p className="text-sm text-slate-600">{feature.description}</p>
                </article>
              ))}
            </div>
          </section>

          <section id={CATALOG_ID} className="shop-section-alt border-y border-slate-200 scroll-mt-28">
            <div className="mx-auto max-w-7xl px-4 py-12">
              <div className="mb-6">
                <h2 className="text-2xl font-semibold text-slate-900">Featured preview</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Inventory placeholders for the upcoming drop.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {Array.from({ length: SKELETON_COUNT }).map((_, index) => (
                  <ShopListingCard key={`skeleton-${index}`} skeleton />
                ))}
              </div>
            </div>
          </section>

          {isAdmin && (
            <div className="mx-auto max-w-7xl px-4 pt-6">
              <Link
                href="/admin/shop"
                className="text-sm text-slate-600 transition-colors hover:text-cyan-700"
              >
                Add listings in Admin
              </Link>
            </div>
          )}
        </>
      ) : (
        <>
          <section className="shop-section-alt border-y border-slate-200">
            <div className="mx-auto max-w-7xl space-y-8 px-4 py-12">
              <div>
                <h2 className="text-2xl font-semibold text-slate-900">Curated inventory</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Featured cards, discounts versus CMV, and premium picks.
                </p>
                <p className="mt-2 text-sm text-slate-500">
                  Prices are benchmarked against CardzCheck Market Value. {" "}
                  <Link
                    href="/comps"
                    className="text-cyan-700 transition-colors hover:text-cyan-600"
                  >
                    Learn how CMV works
                  </Link>
                  .
                </p>
              </div>

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
            </div>
          </section>

          <section
            id={CATALOG_ID}
            className="scroll-mt-28 border-b border-slate-200 bg-white"
          >
            <div className="mx-auto max-w-7xl space-y-6 px-4 py-12">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-2xl font-semibold text-slate-900">Browse inventory</h2>
                {hasActiveFilters && (
                  <button
                    onClick={clearFilters}
                    className="text-sm text-slate-600 transition-colors hover:text-cyan-700"
                  >
                    Reset filters
                  </button>
                )}
              </div>

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

              {catalogFiltered.length === 0 ? (
                <div className="border-t border-slate-200 py-14 text-center">
                  <p className="text-slate-600">No listings match these filters.</p>
                  <div className="mt-4 flex items-center justify-center gap-3">
                    <button
                      onClick={clearFilters}
                      className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-cyan-500"
                    >
                      Clear filters
                    </button>
                    <button
                      onClick={() => applyMerchandisingPreset("featured")}
                      className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:border-slate-400 hover:text-slate-900"
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
                        className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 transition-colors hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
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
                        className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 transition-colors hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Next
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
