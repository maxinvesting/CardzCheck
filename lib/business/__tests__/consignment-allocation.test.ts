import { describe, expect, it } from "vitest";
import { computeConsignmentLines, splitEvenly } from "../consignment-allocation";

const sum = (a: number[]) => a.reduce((s, n) => s + n, 0);

describe("splitEvenly", () => {
  it("splits and keeps every cent", () => {
    const parts = splitEvenly(1000, 3);
    expect(parts).toEqual([334, 333, 333]);
    expect(sum(parts)).toBe(1000);
  });

  it("handles zero cards and zero total", () => {
    expect(splitEvenly(500, 0)).toEqual([]);
    expect(splitEvenly(0, 2)).toEqual([0, 0]);
  });
});

describe("computeConsignmentLines", () => {
  it("spreads the order's fees evenly and computes profit per card", () => {
    const lines = computeConsignmentLines(
      [
        { costCents: 10000, soldCents: 8000 },
        { costCents: 5000, soldCents: 6000 },
      ],
      2000
    );
    expect(lines.map((l) => l.feeCents)).toEqual([1000, 1000]);
    expect(lines.map((l) => l.netCents)).toEqual([7000, 5000]);
    expect(lines.map((l) => l.profitCents)).toEqual([-3000, 0]);
  });
});
