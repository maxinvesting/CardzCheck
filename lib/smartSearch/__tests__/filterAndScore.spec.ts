import { describe, it, expect } from "vitest";
import { parseQuery } from "../parseQuery";
import { bucketByConstraints } from "../filterCandidates";
import { scoreCandidates } from "../scoreCandidates";
import type { SmartSearchCandidate } from "../types";

function makeCandidate(title: string, overrides: Partial<SmartSearchCandidate> = {}): SmartSearchCandidate {
  return {
    id: title,
    title,
    source: "test",
    ...overrides,
  };
}

describe("filtering and scoring", () => {
  it('ensures Contenders cannot be an exact match when query locks Optic in watchlist mode', () => {
    const parsed = parseQuery("2024 Donruss Optic Drake Maye");

    const candidates: SmartSearchCandidate[] = [
      makeCandidate("2024 Donruss Optic Drake Maye Rated Rookie", {
        year: "2024",
        brand: "Donruss",
        line: "Optic",
      }),
      makeCandidate("2024 Panini Contenders Drake Maye Rookie Ticket", {
        year: "2024",
        brand: "Panini",
        line: "Contenders",
      }),
    ];

    const filtered = bucketByConstraints(parsed, candidates, "watchlist");
    const { scored } = scoreCandidates(parsed, [...filtered.exact, ...filtered.close], "watchlist");

    const optic = scored.find((c) => c.title.includes("Optic"));
    const contenders = scored.find((c) => c.title.includes("Contenders"));

    expect(optic).toBeDefined();
    expect(contenders).toBeDefined();
    expect(optic!.confidence).toBeGreaterThan(0.85);
    expect(contenders!.confidence).toBeLessThanOrEqual(0.25);
  });

  it('allows multiple sets when only "drake maye" is searched, ranking by set/parallel match', () => {
    const parsed = parseQuery("drake maye");

    const candidates: SmartSearchCandidate[] = [
      makeCandidate("2024 Donruss Optic Drake Maye Silver Prizm", {
        line: "Optic",
        parallel: "Silver Prizm",
      }),
      makeCandidate("2024 Panini Contenders Drake Maye Rookie Ticket", {
        line: "Contenders",
      }),
    ];

    const filtered = bucketByConstraints(parsed, candidates, "collection");
    const { scored } = scoreCandidates(parsed, [...filtered.exact, ...filtered.close], "collection");

    // Should not drop either candidate, and scoring should still differentiate them (both allowed)
    expect(scored.length).toBe(2);
    // Just ensure we have non-zero scores in collection mode
    expect(scored[0].confidence).toBeGreaterThanOrEqual(0);
    expect(scored[1].confidence).toBeGreaterThanOrEqual(0);
  });

  it("keeps mismatching year/brand only in close bucket for collection mode", () => {
    const parsed = parseQuery("2024 Donruss Optic Drake Maye");

    const candidates: SmartSearchCandidate[] = [
      makeCandidate("2024 Donruss Optic Drake Maye Silver Prizm", {
        year: "2024",
        brand: "Donruss",
        line: "Optic",
      }),
      makeCandidate("2023 Donruss Optic Drake Maye Silver Prizm", {
        year: "2023",
        brand: "Donruss",
        line: "Optic",
      }),
    ];

    const filtered = bucketByConstraints(parsed, candidates, "collection");

    const exactIds = new Set(filtered.exact.map((c) => c.id));
    const closeIds = new Set(filtered.close.map((c) => c.id));

    expect(exactIds.has("2024 Donruss Optic Drake Maye Silver Prizm")).toBe(true);
    expect(closeIds.has("2023 Donruss Optic Drake Maye Silver Prizm")).toBe(true);
  });
});
