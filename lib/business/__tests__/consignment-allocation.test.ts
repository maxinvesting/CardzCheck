import { describe, expect, it } from "vitest";
import { allocateConsignmentPayout } from "../consignment-allocation";

const sum = (a: number[]) => a.reduce((s, n) => s + n, 0);

describe("allocateConsignmentPayout", () => {
  it("equal_loss gives every card the same loss", () => {
    // cost $100 + $50 + $30 = $180, payout $120 → $60 loss, $20 each
    const parts = allocateConsignmentPayout([10000, 5000, 3000], 12000, "equal_loss");
    expect(parts).toEqual([8000, 3000, 1000]);
    expect(parts.map((p, i) => p - [10000, 5000, 3000][i])).toEqual([-2000, -2000, -2000]);
  });

  it("parts always sum to the payout, remainder cents included", () => {
    const parts = allocateConsignmentPayout([1000, 1000, 1000], 2000, "equal_loss");
    expect(sum(parts)).toBe(2000);
    expect(Math.max(...parts) - Math.min(...parts)).toBeLessThanOrEqual(1);
  });

  it("handles a gain the same way", () => {
    const parts = allocateConsignmentPayout([1000, 2000], 4000, "equal_loss");
    expect(parts).toEqual([1500, 2500]);
  });

  it("proportional gives every card the same recovery %", () => {
    const parts = allocateConsignmentPayout([10000, 5000, 5000], 10000, "proportional");
    expect(parts).toEqual([5000, 2500, 2500]);
  });

  it("proportional with zero cost splits evenly", () => {
    const parts = allocateConsignmentPayout([0, 0, 0], 1000, "proportional");
    expect(sum(parts)).toBe(1000);
  });

  it("empty order", () => {
    expect(allocateConsignmentPayout([], 500, "equal_loss")).toEqual([]);
  });
});
