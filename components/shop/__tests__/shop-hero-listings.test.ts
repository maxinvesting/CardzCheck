import { describe, expect, it } from "vitest";
import {
  isListingAvailable,
  selectHeroListings,
  type HeroListingCandidate,
} from "@/components/shop/shop-hero-listings";

function buildListing(
  overrides: Partial<HeroListingCandidate> = {}
): HeroListingCandidate {
  return {
    id: overrides.id ?? "listing-1",
    created_at: overrides.created_at ?? "2026-04-01T00:00:00.000Z",
    featured: overrides.featured ?? false,
    quantity: overrides.quantity ?? 1,
    quantity_sold: overrides.quantity_sold ?? 0,
  };
}

describe("isListingAvailable", () => {
  it("returns false when sold quantity meets available quantity", () => {
    expect(isListingAvailable(buildListing({ quantity: 1, quantity_sold: 1 }))).toBe(
      false
    );
  });

  it("returns true when quantity remains", () => {
    expect(isListingAvailable(buildListing({ quantity: 3, quantity_sold: 1 }))).toBe(
      true
    );
  });
});

describe("selectHeroListings", () => {
  it("prioritizes featured listings ahead of newer non-featured listings", () => {
    const listings = [
      buildListing({
        id: "new-standard",
        created_at: "2026-04-05T00:00:00.000Z",
      }),
      buildListing({
        id: "featured",
        created_at: "2026-04-03T00:00:00.000Z",
        featured: true,
      }),
      buildListing({
        id: "older-standard",
        created_at: "2026-04-02T00:00:00.000Z",
      }),
    ];

    expect(selectHeroListings(listings).map((listing) => listing.id)).toEqual([
      "featured",
      "new-standard",
      "older-standard",
    ]);
  });

  it("falls back to newest listings when nothing is featured", () => {
    const listings = [
      buildListing({
        id: "oldest",
        created_at: "2026-04-01T00:00:00.000Z",
      }),
      buildListing({
        id: "newest",
        created_at: "2026-04-06T00:00:00.000Z",
      }),
      buildListing({
        id: "middle",
        created_at: "2026-04-03T00:00:00.000Z",
      }),
    ];

    expect(selectHeroListings(listings, 2).map((listing) => listing.id)).toEqual([
      "newest",
      "middle",
    ]);
  });

  it("skips sold-out listings when there are still available listings", () => {
    const listings = [
      buildListing({
        id: "sold-featured",
        created_at: "2026-04-06T00:00:00.000Z",
        featured: true,
        quantity: 1,
        quantity_sold: 1,
      }),
      buildListing({
        id: "available-featured",
        created_at: "2026-04-05T00:00:00.000Z",
        featured: true,
      }),
      buildListing({
        id: "available-standard",
        created_at: "2026-04-04T00:00:00.000Z",
      }),
    ];

    expect(selectHeroListings(listings).map((listing) => listing.id)).toEqual([
      "available-featured",
      "available-standard",
    ]);
  });

  it("falls back to sold-out listings when everything is sold out", () => {
    const listings = [
      buildListing({
        id: "sold-newer",
        created_at: "2026-04-06T00:00:00.000Z",
        quantity: 1,
        quantity_sold: 1,
      }),
      buildListing({
        id: "sold-featured",
        created_at: "2026-04-05T00:00:00.000Z",
        featured: true,
        quantity: 1,
        quantity_sold: 1,
      }),
    ];

    expect(selectHeroListings(listings).map((listing) => listing.id)).toEqual([
      "sold-featured",
      "sold-newer",
    ]);
  });
});
