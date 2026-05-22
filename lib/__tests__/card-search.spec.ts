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

  it("returns close candidates with reason codes instead of dead-ending", () => {
    const result = runCardSearch(rows, {
      playerId: "Michael Jordan",
      setSlug: "Fleer",
      parallel: "Silver",
    });
    expect(result.results).toHaveLength(1);
    expect(result.results[0].confidence).toBe("Risky");
    expect(result.results[0].reasonCodes).toContain("WRONG_PARALLEL");
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

  it("matches Panini Prizm Football when the user types Panini Prizm Silver Prism PSA 10", () => {
    const result = runCardSearch(
      [
        {
          id: "jayden-silver",
          player_name: "Jayden Daniels",
          set_name: "Panini Prizm Football",
          year: "2024",
          variant: "Silver",
          grader: "PSA",
          grade: "10",
          card_number: "301",
        },
        {
          id: "draft-picks",
          player_name: "Jayden Daniels",
          set_name: "Panini Prizm Draft Picks",
          year: "2024",
          variant: "Silver Prizm",
          grader: "PSA",
          grade: "10",
        },
        {
          id: "base",
          player_name: "Jayden Daniels",
          set_name: "Panini Prizm Football",
          year: "2024",
          variant: "Base",
          grader: "PSA",
          grade: "10",
        },
      ],
      {
        playerId: "Jayden Daniels",
        setSlug: "Panini Prizm",
        parallel: "Silver Prism",
        grader: "PSA",
        grade: "Gem Mint 10",
      },
      { relaxOptional: true }
    );

    expect(result.results[0].id).toBe("jayden-silver");
    expect(result.results[0].confidence).toBe("Exact");
    expect(result.rejections.find((candidate) => candidate.id === "draft-picks")?.rejectionReasons)
      .toContain("DRAFT_NOT_NFL_PRIZM");
    expect(result.results.find((candidate) => candidate.id === "base")?.reasonCodes)
      .toContain("WRONG_PARALLEL");
  });

  it("rejects Prizm inserts as true Silver Prizm matches", () => {
    const result = runCardSearch(
      [
        {
          id: "emergent",
          player_name: "Jayden Daniels",
          set_name: "Panini Prizm Football",
          year: "2024",
          variant: "Emergent Silver",
          grader: "PSA",
          grade: "10",
          title: "2024 Panini Prizm Jayden Daniels Emergent Silver PSA 10",
        },
      ],
      {
        playerId: "Jayden Daniels",
        setSlug: "Panini Prizm",
        parallel: "Silver Prizm",
        grader: "PSA",
        grade: "10",
      }
    );

    expect(result.results).toHaveLength(0);
    expect(result.rejections[0].rejectionReasons).toContain("INSERT_NOT_BASE");
  });
});
