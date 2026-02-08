import { describe, it, expect } from "vitest";
import {
  parseCardSearchPayload,
  rankCards,
  runCardSearch,
  type CardCatalogRow,
} from "@/lib/cards/search";

describe("parseCardSearchPayload", () => {
  it("requires playerId and setSlug", () => {
    const result = parseCardSearchPayload({ playerId: "Michael Jordan" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.missing).toEqual(["setSlug"]);
    }
  });
});

describe("rankCards", () => {
  const rows: CardCatalogRow[] = [
    {
      id: "a",
      player_name: "Michael Jordan",
      set_name: "Fleer",
      year: "1986",
      variant: "Silver",
      grader: "PSA",
      grade: "10",
      card_number: "57",
    },
    {
      id: "b",
      player_name: "Michael Jordan",
      set_name: "Fleer",
      year: "1986",
      variant: "Base",
      grader: "PSA",
      grade: "9",
      card_number: "57",
    },
  ];

  it("prioritizes cards with more optional filter matches", () => {
    const ranked = rankCards(
      rows,
      {
        playerId: "Michael Jordan",
        setSlug: "Fleer",
        year: "1986",
        parallel: "Silver",
        grader: "PSA",
        grade: "10",
        cardNumber: "57",
      },
      10
    );
    expect(ranked[0].id).toBe("a");
  });
});

describe("runCardSearch", () => {
  const rows: CardCatalogRow[] = [
    {
      id: "a",
      player_name: "Michael Jordan",
      set_name: "Fleer",
      year: "1986",
      variant: "Base",
      card_number: "57",
    },
  ];

  it("returns empty results when optional filters are strict", () => {
    const result = runCardSearch(rows, {
      playerId: "Michael Jordan",
      setSlug: "Fleer",
      parallel: "Silver",
    });
    expect(result.results).toHaveLength(0);
    expect(result.canRelax).toBe(true);
  });

  it("returns results when optional filters are relaxed", () => {
    const result = runCardSearch(
      rows,
      {
        playerId: "Michael Jordan",
        setSlug: "Fleer",
        parallel: "Silver",
      },
      { relaxOptional: true }
    );
    expect(result.results).toHaveLength(1);
    expect(result.relaxed).toBe(true);
  });
});
