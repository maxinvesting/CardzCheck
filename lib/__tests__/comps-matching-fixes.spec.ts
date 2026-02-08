import { describe, it, expect } from "vitest";
import { extractCardNumbers } from "@/lib/ebay/utils";
import { scoreListingTitle } from "@/lib/ebay/dual-signal";

// ─── extractCardNumbers ───

describe("extractCardNumbers", () => {
  it("extracts #349 format", () => {
    expect(extractCardNumbers("2024 Prizm #349 Silver")).toEqual(["349"]);
  });

  it("extracts # 349 with space", () => {
    expect(extractCardNumbers("2024 Prizm # 349 Silver")).toEqual(["349"]);
  });

  it("extracts No. 349 format", () => {
    expect(extractCardNumbers("Panini Prizm No. 349 Silver Prizm")).toEqual(["349"]);
  });

  it("extracts No 349 (no period)", () => {
    expect(extractCardNumbers("Panini Prizm No 349 Silver")).toEqual(["349"]);
  });

  it("extracts Card 349 format", () => {
    expect(extractCardNumbers("Jayden Daniels Card 349 Prizm")).toEqual(["349"]);
  });

  it("does NOT extract years from Card pattern", () => {
    expect(extractCardNumbers("2024 Card 2024 Prizm")).toEqual([]);
  });

  it("does NOT match serial numbers (/349)", () => {
    expect(extractCardNumbers("Prizm /349")).toEqual([]);
  });

  it("extracts multiple distinct numbers", () => {
    const result = extractCardNumbers("Lot #349 #100");
    expect(result).toContain("349");
    expect(result).toContain("100");
  });

  it("deduplicates same number from different patterns", () => {
    const result = extractCardNumbers("#349 No. 349");
    expect(result).toEqual(["349"]);
  });
});

// ─── scoreListingTitle — card number penalty ───

describe("scoreListingTitle card number penalty", () => {
  const baseParams = {
    wantsSilverPrizm: false,
    wantsPsa10: false,
    wantsNoHuddle: false,
    wantsInsert: false,
  };

  it("gives +6 when card number matches", () => {
    const score = scoreListingTitle("2024 Prizm #349 Silver PSA 10", {
      ...baseParams,
      cardNumber: "349",
    });
    expect(score).toBeGreaterThanOrEqual(6);
  });

  it("gives -3 penalty when card number expected but title has no number", () => {
    const withNumber = scoreListingTitle("2024 Prizm Silver PSA 10", {
      ...baseParams,
      cardNumber: "349",
    });
    const without = scoreListingTitle("2024 Prizm Silver PSA 10", {
      ...baseParams,
    });
    expect(withNumber).toBeLessThan(without);
  });

  it("no penalty when card number not requested", () => {
    const score = scoreListingTitle("2024 Prizm Silver PSA 10", {
      ...baseParams,
    });
    // No card number penalty should be applied
    expect(score).toBeGreaterThanOrEqual(0);
  });

  it("no penalty when title has a different card number (hard filter rejects, not scoring)", () => {
    // When title has a different number, the hard filter rejects it.
    // Scoring still gives base score (no -3 since title HAS a number).
    const score = scoreListingTitle("2024 Prizm #100 Silver PSA 10", {
      ...baseParams,
      cardNumber: "349",
    });
    // Should NOT get the -3 penalty since title does have a card number
    const scoreNoNumber = scoreListingTitle("2024 Prizm Silver PSA 10", {
      ...baseParams,
      cardNumber: "349",
    });
    expect(score).toBeGreaterThan(scoreNoNumber);
  });
});
