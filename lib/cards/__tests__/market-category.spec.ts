import { describe, expect, it } from "vitest";
import {
  getEbayBrowseCategoryId,
  getEbayListingCategoryId,
  inferShopCategoryLabel,
} from "@/lib/cards/market-category";

describe("market-category inference", () => {
  it("detects Pokemon cards from text signals", () => {
    expect(
      inferShopCategoryLabel(
        {
          title: "Pikachu ex 151 SAR",
          set: "Pokemon Scarlet & Violet",
          player: "Pikachu",
        },
        "Other"
      )
    ).toBe("Pokemon");
  });

  it("detects One Piece cards from OP set codes", () => {
    expect(
      inferShopCategoryLabel(
        {
          title: "Monkey D. Luffy OP-05",
          set: "Awakening of the New Era OP-05",
          player: "Monkey D. Luffy",
        },
        "Other"
      )
    ).toBe("One Piece");
  });

  it("defaults to sports for eBay lookups when no strong TCG signal exists", () => {
    expect(
      getEbayBrowseCategoryId({
        player: "Patrick Mahomes",
        set: "Panini Prizm",
      })
    ).toBe("212");

    expect(
      getEbayListingCategoryId({
        player: "Patrick Mahomes",
        set: "Panini Prizm",
      })
    ).toBe("261328");
  });
});
