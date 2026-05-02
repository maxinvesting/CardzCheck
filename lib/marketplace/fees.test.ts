import { describe, expect, it } from "vitest";
import {
  calculateFee,
  resolveFeeTier,
  STRONG_COMPS_THRESHOLD,
} from "./fees";

describe("resolveFeeTier", () => {
  it("self-serve always returns one_pct", () => {
    expect(
      resolveFeeTier({
        mode: "self_serve",
        pipeline: "standard",
        grade: "PSA 10",
        sold_comps_count: 0,
      })
    ).toBe("one_pct");
  });

  it("grails returns one_pct flat", () => {
    expect(
      resolveFeeTier({
        mode: "full_service",
        pipeline: "grails",
        grade: "PSA 9",
        sold_comps_count: 0,
      })
    ).toBe("one_pct");
  });

  it("elite returns negotiated", () => {
    expect(
      resolveFeeTier({
        mode: "full_service",
        pipeline: "elite",
        grade: "PSA 10",
        sold_comps_count: 100,
      })
    ).toBe("negotiated");
  });

  it("full-service PSA 10 with strong comps -> two_pct", () => {
    expect(
      resolveFeeTier({
        mode: "full_service",
        pipeline: "standard",
        grade: "PSA 10",
        sold_comps_count: STRONG_COMPS_THRESHOLD,
      })
    ).toBe("two_pct");
  });

  it("full-service PSA 10 with weak comps -> five_pct", () => {
    expect(
      resolveFeeTier({
        mode: "full_service",
        pipeline: "standard",
        grade: "PSA 10",
        sold_comps_count: STRONG_COMPS_THRESHOLD - 1,
      })
    ).toBe("five_pct");
  });

  it("full-service PSA 9 -> five_pct regardless of comps", () => {
    expect(
      resolveFeeTier({
        mode: "full_service",
        pipeline: "standard",
        grade: "PSA 9",
        sold_comps_count: 100,
      })
    ).toBe("five_pct");
  });

  it("grade normalization handles 'PSA10' and bare '10'", () => {
    expect(
      resolveFeeTier({
        mode: "full_service",
        pipeline: "standard",
        grade: "PSA10",
        sold_comps_count: 10,
      })
    ).toBe("two_pct");
    expect(
      resolveFeeTier({
        mode: "full_service",
        pipeline: "standard",
        grade: "10",
        sold_comps_count: 10,
      })
    ).toBe("two_pct");
  });
});

describe("calculateFee", () => {
  it("computes 1% / 2% / 5% rates and rounds", () => {
    expect(calculateFee(10_000, "one_pct").fee_amount_cents).toBe(100);
    expect(calculateFee(10_000, "two_pct").fee_amount_cents).toBe(200);
    expect(calculateFee(10_000, "five_pct").fee_amount_cents).toBe(500);
    expect(calculateFee(12_345, "two_pct").fee_amount_cents).toBe(247);
  });

  it("requires explicit amount for negotiated tier", () => {
    expect(() => calculateFee(100_000, "negotiated")).toThrow();
    expect(calculateFee(100_000, "negotiated", 7_500).fee_amount_cents).toBe(7_500);
  });

  it("rejects negative sale price", () => {
    expect(() => calculateFee(-1, "one_pct")).toThrow();
  });
});
