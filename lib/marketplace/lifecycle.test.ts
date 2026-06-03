import { describe, expect, it } from "vitest";
import {
  applyAutoMarkdown,
  applyDay30Markdown,
  ebayColistPriceCents,
  DAY30_REDUCTION_RATE,
  EBAY_COLIST_MARKUP_RATE,
} from "./lifecycle";

describe("applyDay30Markdown", () => {
  it("reduces price by 7.5%", () => {
    expect(applyDay30Markdown(10_000)).toBe(9_250);
  });

  it("rounds to whole cents", () => {
    // 1234 * 0.925 = 1141.45 -> 1141
    expect(applyDay30Markdown(1_234)).toBe(1_141);
  });

  it("never goes below 1 cent", () => {
    expect(applyDay30Markdown(1)).toBe(1);
  });

  it("matches the documented rate constant", () => {
    expect(DAY30_REDUCTION_RATE).toBe(0.075);
  });

  it("rejects zero / negative / NaN input", () => {
    expect(() => applyDay30Markdown(0)).toThrow();
    expect(() => applyDay30Markdown(-100)).toThrow();
    expect(() => applyDay30Markdown(Number.NaN)).toThrow();
  });
});

describe("applyAutoMarkdown", () => {
  it("reduces price by the configured percentage", () => {
    expect(applyAutoMarkdown(10_000, 0.05, null)).toBe(9_500);
  });

  it("clamps to the floor and never goes below it", () => {
    // 5_000 * 0.9 = 4_500, but floor is 4_800.
    expect(applyAutoMarkdown(5_000, 0.1, 4_800)).toBe(4_800);
  });

  it("is a no-op when already at/below the floor", () => {
    expect(applyAutoMarkdown(4_800, 0.1, 4_800)).toBe(4_800);
    expect(applyAutoMarkdown(4_000, 0.1, 4_800)).toBe(4_000);
  });

  it("rejects invalid percentages", () => {
    expect(() => applyAutoMarkdown(10_000, 0, null)).toThrow();
    expect(() => applyAutoMarkdown(10_000, 1, null)).toThrow();
    expect(() => applyAutoMarkdown(10_000, -0.1, null)).toThrow();
  });
});

describe("ebayColistPriceCents", () => {
  it("marks the marketplace price up by 13.5%", () => {
    expect(ebayColistPriceCents(10_000)).toBe(11_350);
    expect(EBAY_COLIST_MARKUP_RATE).toBe(0.135);
  });

  it("rounds to whole cents", () => {
    // 1_999 * 1.135 = 2_268.865 -> 2_269
    expect(ebayColistPriceCents(1_999)).toBe(2_269);
  });

  it("rejects non-positive input", () => {
    expect(() => ebayColistPriceCents(0)).toThrow();
    expect(() => ebayColistPriceCents(-1)).toThrow();
  });
});
