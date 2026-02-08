import { describe, expect, it } from "vitest";
import { parseFirstJsonObject } from "@/lib/card-identity/json";
import { emptyCardIdentity } from "@/lib/card-identity/result";

function allNullIdentity(identity: ReturnType<typeof emptyCardIdentity>) {
  return {
    player: identity.player,
    year: identity.year,
    brand: identity.brand,
    setName: identity.setName,
    subset: identity.subset,
    sport: identity.sport,
    league: identity.league,
    cardNumber: identity.cardNumber,
    rookie: identity.rookie,
    parallel: identity.parallel,
    cardStock: identity.cardStock,
  };
}

describe("CardIdentity parsing", () => {
  it("extracts first JSON object", () => {
    const parsed = parseFirstJsonObject("prefix {\"player\":\"Test\"} suffix");
    expect(parsed.value).toEqual({ player: "Test" });
  });

  it("returns fallback with null fields on parse error", () => {
    const fallback = emptyCardIdentity(["parse_error"]);
    expect(allNullIdentity(fallback)).toEqual({
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
    });
    expect(fallback.warnings).toContain("parse_error");
  });
});
