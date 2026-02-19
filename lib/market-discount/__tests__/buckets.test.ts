import { describe, expect, it } from "vitest";
import {
  buildBucket,
  confidenceFromBucket,
  confidenceFromFactor,
  getGradedFlag,
  getLiquidityBucket,
  getPriceTier,
} from "@/lib/market-discount/buckets";

describe("market-discount buckets", () => {
  it("computes price and liquidity buckets", () => {
    expect(getPriceTier(49.99)).toBe("0-50");
    expect(getPriceTier(150)).toBe("150-300");
    expect(getPriceTier(1500)).toBe("1200+");
    expect(getLiquidityBucket(2)).toBe("0-2");
    expect(getLiquidityBucket(7)).toBe("6-10");
    expect(getLiquidityBucket(12)).toBe("11+");
  });

  it("infers graded flag", () => {
    expect(getGradedFlag("Raw")).toBe("raw");
    expect(getGradedFlag("PSA 10")).toBe("graded");
    expect(getGradedFlag("Near Mint")).toBe("unknown");
  });

  it("builds bucket with auction mix and confidence", () => {
    const bucket = buildBucket({
      listingMedianDollars: 210,
      soldCount: 4,
      grade: "PSA 9",
      auctionCount: 7,
      listingCount: 10,
    });

    expect(bucket.priceTier).toBe("150-300");
    expect(bucket.liquidityBucket).toBe("3-5");
    expect(bucket.gradedFlag).toBe("graded");
    expect(bucket.auctionMix).toBe("mostly_auction");

    expect(
      confidenceFromFactor({
        soldCount: 12,
        listingCount: 12,
        outliersRemovedSold: 1,
        outliersRemovedListing: 1,
      })
    ).toBe("high");

    expect(confidenceFromBucket({ nCards: 24, iqrWidth: 0.08 })).toBe("high");
    expect(confidenceFromBucket({ nCards: 10, iqrWidth: 0.2 })).toBe("medium");
    expect(confidenceFromBucket({ nCards: 3, iqrWidth: 0.2 })).toBe("low");
  });
});
