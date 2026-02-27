"use client";

import Link from "next/link";
import ShopListingCard from "./ShopListingCard";
import type { ShopListing } from "@/types/shop";

interface ShopSectionCarouselProps {
  title: string;
  listings: ShopListing[];
  seeAllHref?: string;
  seeAllLabel?: string;
  onQuickView?: (listing: ShopListing) => void;
}

export default function ShopSectionCarousel({
  title,
  listings,
  seeAllHref,
  seeAllLabel = "See all",
  onQuickView,
}: ShopSectionCarouselProps) {
  if (listings.length === 0) return null;

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        {seeAllHref && (
          <Link
            href={seeAllHref}
            className="text-sm text-cyan-400 hover:text-cyan-300 font-medium"
          >
            {seeAllLabel}
          </Link>
        )}
      </div>
      <div className="flex gap-4 overflow-x-auto pb-2 -mx-4 px-4 md:mx-0 md:px-0 md:grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 md:overflow-visible md:gap-6">
        {listings.map((listing) => (
          <div
            key={listing.id}
            className="flex-shrink-0 w-[180px] sm:w-[200px] md:w-auto md:flex-shrink"
          >
            <ShopListingCard listing={listing} onQuickView={onQuickView} />
          </div>
        ))}
      </div>
    </section>
  );
}
