import { describe, it, expect } from "vitest";
import {
  computePositionVsFloor,
  estimateTakeHome,
  fmtCents,
  fmtPct,
} from "../pricing";

// ── computePositionVsFloor ───────────────────────────────────────────

describe("computePositionVsFloor", () => {
  it("returns null when list price is null", () => {
    expect(computePositionVsFloor(null, 1000)).toBeNull();
  });

  it("returns null when floor is null", () => {
    expect(computePositionVsFloor(1000, null)).toBeNull();
  });

  it("returns null when floor is zero", () => {
    expect(computePositionVsFloor(1000, 0)).toBeNull();
  });

  it("returns null when floor is negative", () => {
    expect(computePositionVsFloor(1000, -500)).toBeNull();
  });

  it("computes correct diff for price above floor", () => {
    // list = $15, floor = $10 → +$5, +50%
    const result = computePositionVsFloor(1500, 1000);
    expect(result).not.toBeNull();
    expect(result!.diffCents).toBe(500);
    expect(result!.diffPct).toBeCloseTo(50.0);
    expect(result!.severity).toBe("well-above");
  });

  it("computes correct diff for price below floor", () => {
    // list = $8, floor = $10 → -$2, -20%
    const result = computePositionVsFloor(800, 1000);
    expect(result).not.toBeNull();
    expect(result!.diffCents).toBe(-200);
    expect(result!.diffPct).toBeCloseTo(-20.0);
    expect(result!.severity).toBe("low");
  });

  it('returns severity "at" when price is at floor', () => {
    const result = computePositionVsFloor(1000, 1000);
    expect(result).not.toBeNull();
    expect(result!.diffCents).toBe(0);
    expect(result!.diffPct).toBeCloseTo(0);
    expect(result!.severity).toBe("at");
  });

  it('returns severity "above" for moderate difference', () => {
    // list = $11.50, floor = $10 → +$1.50, +15%
    const result = computePositionVsFloor(1150, 1000);
    expect(result).not.toBeNull();
    expect(result!.diffPct).toBeCloseTo(15.0);
    expect(result!.severity).toBe("above");
  });

  it('returns severity "at" within 5% band', () => {
    // list = $10.40, floor = $10 → +$0.40, +4%
    const result = computePositionVsFloor(1040, 1000);
    expect(result).not.toBeNull();
    expect(result!.severity).toBe("at");
  });
});

// ── estimateTakeHome ─────────────────────────────────────────────────

describe("estimateTakeHome", () => {
  it("returns empty array for null price", () => {
    expect(estimateTakeHome(null)).toEqual([]);
  });

  it("returns empty array for zero price", () => {
    expect(estimateTakeHome(0)).toEqual([]);
  });

  it("computes eBay and Whatnot estimates with default rates", () => {
    // list = $100
    const results = estimateTakeHome(10000);
    expect(results.length).toBe(2);

    const ebay = results.find((r) => r.channel === "ebay")!;
    expect(ebay).toBeDefined();
    expect(ebay.grossCents).toBe(10000);
    expect(ebay.feesCents).toBe(1300); // 13%
    expect(ebay.netCents).toBe(8700);
    expect(ebay.feeRate).toBe(0.13);

    const whatnot = results.find((r) => r.channel === "whatnot")!;
    expect(whatnot).toBeDefined();
    expect(whatnot.grossCents).toBe(10000);
    expect(whatnot.feesCents).toBe(950); // 9.5%
    expect(whatnot.netCents).toBe(9050);
    expect(whatnot.feeRate).toBe(0.095);
  });

  it("accepts custom fee rates", () => {
    const results = estimateTakeHome(10000, { ebay: 0.15, whatnot: 0.10 });
    const ebay = results.find((r) => r.channel === "ebay")!;
    expect(ebay.feesCents).toBe(1500);
    expect(ebay.netCents).toBe(8500);
  });
});

// ── Formatters ───────────────────────────────────────────────────────

describe("fmtCents", () => {
  it("formats positive cents", () => {
    expect(fmtCents(1234)).toBe("$12.34");
  });

  it("formats zero", () => {
    expect(fmtCents(0)).toBe("$0.00");
  });

  it("returns dash for null", () => {
    expect(fmtCents(null)).toBe("—");
  });

  it("returns dash for undefined", () => {
    expect(fmtCents(undefined)).toBe("—");
  });
});

describe("fmtPct", () => {
  it("formats positive percent with sign", () => {
    expect(fmtPct(15.5)).toBe("+15.5%");
  });

  it("formats negative percent", () => {
    expect(fmtPct(-3.2)).toBe("-3.2%");
  });

  it("formats zero", () => {
    expect(fmtPct(0)).toBe("0.0%");
  });

  it("returns dash for null", () => {
    expect(fmtPct(null)).toBe("—");
  });
});
