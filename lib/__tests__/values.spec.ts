import { describe, it, expect } from "vitest";
import { computeCollectionSummary, getEstCmv } from "../values";

describe("values helpers", () => {
  it("uses estimated_cmv when est_cmv is missing", () => {
    const item = {
      estimated_cmv: 142.5,
      purchase_price: 80,
    };

    expect(getEstCmv(item as any)).toBe(142.5);

    const summary = computeCollectionSummary([item as any]);
    expect(summary.totalDisplayValue).toBe(142.5);
    expect(summary.cardsWithCmv).toBe(1);
  });
});
