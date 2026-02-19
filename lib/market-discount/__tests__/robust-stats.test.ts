import { describe, expect, it } from "vitest";
import { robustStats } from "@/lib/market-discount/robust-stats";

describe("robustStats", () => {
  it("removes null/zero prices and trims IQR outliers", () => {
    const result = robustStats([0, null, 100, 110, 120, 115, 105, 5000]);

    expect(result.rawCount).toBe(6);
    expect(result.outliersRemoved).toBe(1);
    expect(result.medianBeforeTrim).toBe(112.5);
    expect(result.medianAfterTrim).toBe(110);
    expect(result.cleanedCount).toBe(5);
  });

  it("returns null medians for empty input", () => {
    const result = robustStats([0, null, undefined]);

    expect(result.rawCount).toBe(0);
    expect(result.cleanedCount).toBe(0);
    expect(result.medianBeforeTrim).toBeNull();
    expect(result.medianAfterTrim).toBeNull();
  });
});
