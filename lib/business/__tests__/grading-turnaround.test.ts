import { describe, expect, it } from "vitest";
import {
  addBusinessDays,
  businessDaysBetween,
  formatGradingCountdown,
  getGradingCountdown,
} from "../grading-turnaround";

// 2026-10-07 is a Wednesday.
const wed = new Date(2026, 9, 7);

describe("grading turnaround countdown", () => {
  it("starts at the full turnaround on the day sent", () => {
    expect(getGradingCountdown("2026-10-07", 100, wed)?.daysRemaining).toBe(100);
  });

  it("drops by one per weekday and skips weekends", () => {
    expect(getGradingCountdown("2026-10-07", 100, new Date(2026, 9, 8))?.daysRemaining).toBe(99);
    expect(getGradingCountdown("2026-10-07", 100, new Date(2026, 9, 9))?.daysRemaining).toBe(98);
    // Sat + Sun don't count
    expect(getGradingCountdown("2026-10-07", 100, new Date(2026, 9, 11))?.daysRemaining).toBe(98);
    expect(getGradingCountdown("2026-10-07", 100, new Date(2026, 9, 12))?.daysRemaining).toBe(97);
  });

  it("goes negative once overdue", () => {
    const c = getGradingCountdown("2026-10-07", 2, new Date(2026, 9, 12))!;
    expect(c.daysRemaining).toBe(-1);
    expect(c.overdue).toBe(true);
    expect(formatGradingCountdown(c)).toBe("1 bus. day overdue");
  });

  it("computes the estimated return date in business days", () => {
    // Wed + 3 business days = Mon
    expect(addBusinessDays(wed, 3)).toEqual(new Date(2026, 9, 12));
    expect(businessDaysBetween(wed, new Date(2026, 9, 12))).toBe(3);
  });

  it("returns null without a sent date or turnaround", () => {
    expect(getGradingCountdown(null, 10, wed)).toBeNull();
    expect(getGradingCountdown("2026-10-07", null, wed)).toBeNull();
  });
});
