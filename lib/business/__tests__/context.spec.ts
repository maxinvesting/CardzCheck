import { describe, expect, it } from "vitest";
import {
  canReserveAnotherSeat,
  isBusinessSubscriptionActive,
} from "@/lib/business/context";

describe("business context helpers", () => {
  it("treats active business statuses as valid when period end is future", () => {
    const nextMonth = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    expect(isBusinessSubscriptionActive("active", nextMonth)).toBe(true);
    expect(isBusinessSubscriptionActive("trialing", nextMonth)).toBe(true);
    expect(isBusinessSubscriptionActive("past_due", nextMonth)).toBe(true);
  });

  it("rejects inactive statuses and expired periods", () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    expect(isBusinessSubscriptionActive("canceled", null)).toBe(false);
    expect(isBusinessSubscriptionActive("active", yesterday)).toBe(false);
  });

  it("checks seat reservation capacity against reserved seats", () => {
    expect(
      canReserveAnotherSeat({
        seatsIncluded: 1,
        seatQuantity: 3,
        purchasedSeats: 2,
        activeMembers: 2,
        pendingInvites: 0,
        usedSeats: 2,
        reservedSeats: 2,
        availableSeats: 1,
      })
    ).toBe(true);

    expect(
      canReserveAnotherSeat({
        seatsIncluded: 1,
        seatQuantity: 2,
        purchasedSeats: 1,
        activeMembers: 2,
        pendingInvites: 0,
        usedSeats: 2,
        reservedSeats: 2,
        availableSeats: 0,
      })
    ).toBe(false);
  });
});

