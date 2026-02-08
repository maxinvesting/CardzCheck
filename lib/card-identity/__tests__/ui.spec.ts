import { describe, expect, it } from "vitest";
import { formatSetLabel } from "@/lib/card-identity/ui";
import type { CardIdentity } from "@/types";

function makeIdentity(overrides: Partial<CardIdentity>): CardIdentity {
  return {
    player: null,
    year: null,
    brand: null,
    setName: null,
    subset: null,
    sport: null,
    league: null,
    cardNumber: null,
    rookie: null,
    parallel: null,
    cardStock: "unknown",
    confidence: "low",
    fieldConfidence: { year: "low", player: "low" },
    sources: {},
    warnings: [],
    evidenceSummary: null,
    ...overrides,
  };
}

describe("CardIdentity UI formatting", () => {
  it("combines brand + set when needed", () => {
    const identity = makeIdentity({ brand: "Topps", setName: "Chrome", parallel: "Refractor" });
    const { setLabel, parallel } = formatSetLabel(identity);
    expect(setLabel).toBe("Topps Chrome");
    expect(parallel).toBe("Refractor");
  });
});
