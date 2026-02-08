import { describe, it, expect } from "vitest";
import {
  aggregateCollectionValue,
  computeCollectionSummary,
  getEstCmv,
} from "../values";

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

  it("parses numeric CMV values returned as strings", () => {
    const item = {
      estimated_cmv: "142.5",
      purchase_price: "80",
    };

    expect(getEstCmv(item as any)).toBe(142.5);

    const summary = computeCollectionSummary([item as any]);
    expect(summary.totalDisplayValue).toBe(142.5);
    expect(summary.cardsWithCmv).toBe(1);
  });

  it("does not coerce missing CMV to 0", () => {
    const item = {
      estimated_cmv: null,
      purchase_price: 50,
    };

    const summary = computeCollectionSummary([item as any]);
    expect(summary.totalDisplayValue).toBeNull();
    expect(summary.cardsWithCmv).toBe(0);
  });

  it("ignores zero-valued est_cmv when estimated_cmv exists", () => {
    const item = {
      est_cmv: 0,
      estimated_cmv: 120,
      purchase_price: 50,
    };

    expect(getEstCmv(item as any)).toBe(120);
  });

  it("treats non-positive CMV as missing", () => {
    const item = {
      est_cmv: 0,
      purchase_price: 50,
    };

    expect(getEstCmv(item as any)).toBeNull();

    const summary = computeCollectionSummary([item as any]);
    expect(summary.totalDisplayValue).toBeNull();
    expect(summary.cardsWithCmv).toBe(0);
  });

  it("uses cmv_mid when comps exist to avoid unavailable UI", () => {
    const item = {
      comps_count: 4,
      cmv_mid: 200,
    };

    expect(getEstCmv(item as any)).toBe(200);
  });

  it("aggregateCollectionValue returns null when no CMV is available", () => {
    const item = {
      estimated_cmv: null,
      purchase_price: 50,
    };

    expect(aggregateCollectionValue([item as any])).toBeNull();
  });
});
