import { describe, it, expect } from "vitest";
import { buildSearchQuery, isJunkListing } from "../utils";
import type { EbaySearchParams } from "../types";

describe("eBay query builder", () => {
  it("never includes exclusion operators in final query output", () => {
    const params: EbaySearchParams = {
      player: "Jayden Daniels -mosaic",
      year: "2023-24",
      set: "Panini Prizm -\"draft picks\"",
      grade: "PSA 9",
      cardNumber: "349",
      parallelType: "Silver Prizm -select",
      keywords: ["rookie", "-optic", "-kaboom"],
    };
    const query = buildSearchQuery(params);
    expect(query).not.toMatch(/(^|\s)-(?:"[^"]+"|\S+)/);
    expect(query).not.toContain("-select");
    expect(query).not.toContain("-mosaic");
    expect(query).not.toContain("-optic");
    expect(query).not.toContain("-\"draft picks\"");
    expect(query).toContain("2023-24");
  });

  it("returns only positive identifiers in desired form", () => {
    const params: EbaySearchParams = {
      player: "Jayden Daniels",
      year: "2024",
      set: "Panini Prizm",
      grade: "PSA 9",
      cardNumber: "349",
      parallelType: "Silver Prizm",
    };
    const query = buildSearchQuery(params);
    expect(query).toContain("Jayden Daniels");
    expect(query).toContain("2024");
    expect(query).toContain("Panini Prizm");
    expect(query).toContain("PSA 9");
    expect(query).toContain("349");
    expect(query).toContain("silver");
    expect(query).toContain("prizm");
  });
});

describe("post-retrieval junk filter", () => {
  const junkTerms = [
    "lot",
    "lots",
    "break",
    "case",
    "box",
    "pack",
    "blaster",
    "hobby box",
    "digital",
    "reprint",
    "replica",
    "proxy",
    "custom",
  ];

  it.each(junkTerms)("rejects title containing %s (case-insensitive)", (term) => {
    const title = `Jayden Daniels 2024 Prizm Silver ${term} PSA 9`;
    expect(isJunkListing(title)).toBe(true);
    expect(isJunkListing(title.toUpperCase())).toBe(true);
  });

  it("accepts title with no junk terms", () => {
    expect(isJunkListing("Jayden Daniels 2024 Panini Prizm Silver Prizm PSA 9 #349")).toBe(false);
    expect(isJunkListing("2024 Prizm Jayden Daniels Silver Prizm PSA 9")).toBe(false);
  });
});
