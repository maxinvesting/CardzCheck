import { describe, expect, it } from "vitest";
import {
  ELITE_THRESHOLD_CENTS,
  MIN_ESTIMATED_VALUE_CENTS,
  type IntakeCardInput,
  validateIntake,
} from "./intake";

function makeCard(overrides: Partial<IntakeCardInput> = {}): IntakeCardInput {
  return {
    title: "2018 Topps Chrome Shohei Ohtani Rookie",
    player: "Shohei Ohtani",
    year: 2018,
    manufacturer: "topps",
    grade: "10",
    grading_service: "PSA",
    cert_number: "12345678",
    parallel: null,
    print_run: null,
    estimated_value_cents: 50_000,
    ...overrides,
  };
}

describe("validateIntake", () => {
  it("rejects below the $100 minimum", () => {
    const result = validateIntake(
      makeCard({ estimated_value_cents: MIN_ESTIMATED_VALUE_CENTS - 1 }),
      5
    );
    expect(result).toEqual({
      approved: false,
      rejection_reason: "below_minimum_value",
    });
  });

  it("rejects unsupported grading services", () => {
    const result = validateIntake(makeCard({ grading_service: "CGC" }), 5);
    expect(result).toEqual({
      approved: false,
      rejection_reason: "unsupported_grading_service",
    });
  });

  it("rejects unsupported manufacturers", () => {
    const result = validateIntake(makeCard({ manufacturer: "upper_deck" }), 5);
    expect(result).toEqual({
      approved: false,
      rejection_reason: "unsupported_manufacturer",
    });
  });

  it("rejects standard-tier cards with no sold comps", () => {
    const result = validateIntake(
      makeCard({ estimated_value_cents: 50_000 }),
      0
    );
    expect(result).toEqual({
      approved: false,
      rejection_reason: "no_sold_comps",
    });
  });

  it("approves a $500 PSA Topps card with comps as standard, auto-approved", () => {
    const result = validateIntake(
      makeCard({ estimated_value_cents: 50_000 }),
      4
    );
    expect(result).toEqual({
      approved: true,
      pipeline: "standard",
      requires_manual_approval: false,
    });
  });

  it("routes $5,000+ cards to elite pipeline pending manual approval", () => {
    const result = validateIntake(
      makeCard({ estimated_value_cents: ELITE_THRESHOLD_CENTS }),
      0
    );
    expect(result).toEqual({
      approved: true,
      pipeline: "elite",
      requires_manual_approval: true,
    });
  });

  it("does not require comps for elite-tier cards", () => {
    const result = validateIntake(
      makeCard({ estimated_value_cents: 1_000_000 }),
      0
    );
    expect(result.approved).toBe(true);
    if (result.approved) expect(result.pipeline).toBe("elite");
  });

  it("never auto-assigns grails (only admin can promote)", () => {
    const result = validateIntake(
      makeCard({ estimated_value_cents: 5_000_000 }),
      10
    );
    expect(result.approved).toBe(true);
    if (result.approved) expect(result.pipeline).toBe("elite");
  });

  it("handles BGS and SGC grading services", () => {
    expect(
      validateIntake(makeCard({ grading_service: "BGS" }), 3).approved
    ).toBe(true);
    expect(
      validateIntake(makeCard({ grading_service: "SGC" }), 3).approved
    ).toBe(true);
  });

  it("accepts panini manufacturer", () => {
    expect(
      validateIntake(makeCard({ manufacturer: "panini" }), 3).approved
    ).toBe(true);
  });
});
