import { describe, expect, it } from "vitest";
import { normalizeIdentificationResult } from "@/lib/card-identity/result";
import type { CardIdentificationResult } from "@/types";

function makeResult(overrides: Partial<CardIdentificationResult>): CardIdentificationResult {
  return normalizeIdentificationResult({
    player_name: "",
    imageUrl: "",
    confidence: "low",
    ...overrides,
  });
}

describe("CardIdentity state isolation", () => {
  it("does not carry over player between analyses", () => {
    const cardA = makeResult({
      player_name: "Luka Doncic",
      confidence: "high",
      imageUrl: "card-a",
    });

    const cardB = makeResult({
      player_name: "",
      confidence: "low",
      imageUrl: "card-b",
      cardIdentity: {
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
        warnings: ["parse_error"],
        evidenceSummary: "Model output could not be parsed. Please confirm details.",
      },
    });

    let state: CardIdentificationResult | null = null;
    state = cardA;
    state = cardB;

    expect(state.player_name).not.toBe("Luka Doncic");
    expect(state.player_name).toBe("");
    expect(state.set_name).toBeUndefined();
    expect(state.year).toBeUndefined();
    expect(state.parallel_type).toBeUndefined();
  });

  it("retains player name even when overall confidence is low", () => {
    const result = makeResult({
      player_name: "Cooper Flagg",
      confidence: "low",
      imageUrl: "card-c",
      cardIdentity: {
        player: "Cooper Flagg",
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
        sources: { player: "ocr" },
        warnings: [],
        evidenceSummary: null,
      },
    });

    expect(result.player_name).toBe("Cooper Flagg");
  });
});
