"use client";

import Link from "next/link";
import ShopListingCard from "./ShopListingCard";
import type { ShopListing } from "@/types/shop";

interface ShopSectionCarouselProps {
  title: string;
  subtitle?: string;
  listings: ShopListing[];
  seeAllHref?: string;
  seeAllLabel?: string;
  onSeeAll?: () => void;
}

export default function ShopSectionCarousel({
  title,
  subtitle,
  listings,
  seeAllHref,
  seeAllLabel = "See all",
  onSeeAll,
}: ShopSectionCarouselProps) {
  if (listings.length === 0) return null;

  const cta = onSeeAll ? (
    <a
      href="#shop-catalog"
      onClick={(event) => {
        event.preventDefault();
        onSeeAll();
      }}
      className="text-sm font-medium text-cyan-700 transition-colors hover:text-cyan-600"
    >
      {seeAllLabel}
    </a>
  ) : seeAllHref ? (
    <Link
      href={seeAllHref}
      className="text-sm font-medium text-cyan-700 transition-colors hover:text-cyan-600"
    >
      {seeAllLabel}
    </Link>
  ) : null;

  return (
    <section className="space-y-5 border-t border-slate-200 pt-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
          {subtitle && <p className="mt-1 text-sm text-slate-600">{subtitle}</p>}
        </div>
        {cta}
      </div>

      <div className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-2 md:gap-5 md:overflow-visible md:px-0 lg:grid-cols-4">
        {listings.map((listing) => (
          <div
            key={listing.id}
            className="w-[250px] shrink-0 snap-start md:w-auto md:shrink"
          >
            <ShopListingCard listing={listing} />
          </div>
        ))}
      </div>
    </section>
  );
}
