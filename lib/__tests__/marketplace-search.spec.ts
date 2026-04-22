import { describe, expect, it } from "vitest";
import {
  buildBeckettMarketplaceSearchUrl,
  buildComcSearchUrl,
  buildEbaySearchUrl,
  buildFanaticsCollectSearchUrl,
  buildFacebookMarketplaceSearchUrl,
  buildMarketplaceSearchQuery,
  buildMySlabsSearchUrl,
} from "@/lib/marketplace-search";

describe("marketplace search query builder", () => {
  it("builds a structured card query with grade info", () => {
    expect(
      buildMarketplaceSearchQuery({
        year: "2023",
        player: "CJ Stroud",
        setName: "Panini Prizm",
        parallel: "Blue Wave",
        cardNumber: "339",
        gradingCompany: "PSA",
        grade: "9",
      })
    ).toBe("2023 CJ Stroud Panini Prizm Blue Wave #339 PSA 9");
  });

  it("drops base parallels and raw grade labels", () => {
    expect(
      buildMarketplaceSearchQuery({
        year: "2024",
        player: "Jayden Daniels",
        setName: "Donruss Optic",
        parallel: "Base",
        cardNumber: "4",
        grade: "Raw",
      })
    ).toBe("2024 Jayden Daniels Donruss Optic #4");
  });

  it("falls back to title when structured fields are missing", () => {
    expect(
      buildMarketplaceSearchQuery({
        title: "Shohei Ohtani Bowman Chrome Rookie PSA 10",
      })
    ).toBe("Shohei Ohtani Bowman Chrome Rookie PSA 10");
  });
});

describe("marketplace search URLs", () => {
  const params = {
    year: "2023",
    player: "CJ Stroud",
    setName: "Panini Prizm",
    parallel: "Blue Wave",
    gradingCompany: "PSA",
    grade: "9",
  };

  it("builds an eBay live search url", () => {
    expect(buildEbaySearchUrl(params)).toContain("https://www.ebay.com/sch/i.html");
    expect(buildEbaySearchUrl(params)).toContain("_nkw=2023+CJ+Stroud+Panini+Prizm+Blue+Wave+PSA+9");
  });

  it("builds partner marketplace search urls", () => {
    expect(buildFanaticsCollectSearchUrl(params)).toContain("fanaticscollect.com/marketplace?type=FIXED");
    expect(buildFacebookMarketplaceSearchUrl(params)).toContain("facebook.com/marketplace/search/");
    expect(buildBeckettMarketplaceSearchUrl(params)).toContain("marketplace.beckett.com/search_new/");
    expect(buildMySlabsSearchUrl(params)).toContain("myslabs.com/search/all/");
    expect(buildComcSearchUrl(params)).toBe(
      "https://www.comc.com/Cards,=2023+CJ+Stroud+Panini+Prizm+Blue+Wave+PSA+9"
    );
  });
});
