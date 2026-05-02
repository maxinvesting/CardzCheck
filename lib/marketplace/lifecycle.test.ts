import { describe, expect, it } from "vitest";
import { applyDay30Markdown, DAY30_REDUCTION_RATE } from "./lifecycle";

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
