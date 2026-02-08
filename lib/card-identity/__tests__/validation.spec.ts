import { describe, expect, it } from "vitest";
import { buildCardIdentityFromSignals, buildOcrSignals } from "@/lib/card-identity/normalize";

const emptyOcr = buildOcrSignals([]);

describe("CardIdentity validation", () => {
  it("removes Prizm parallels on paper Donruss", () => {
    const identity = buildCardIdentityFromSignals(
      emptyOcr,
      {
        setName: "Donruss",
        parallel: "Silver Prizm",
        confidence: "high",
        fieldConfidence: { setName: "high", parallel: "high" },
      },
      2026
    );
    expect(identity.cardStock).toBe("paper");
    expect(identity.parallel).toBeNull();
    expect(identity.warnings).toContain("parallel_invalid");
  });

  it("keeps chromium combos", () => {
    const identity = buildCardIdentityFromSignals(
      emptyOcr,
      {
        setName: "Topps Chrome",
        parallel: "Refractor",
        confidence: "high",
        fieldConfidence: { setName: "high", parallel: "high" },
      },
      2026
    );
    expect(identity.cardStock).toBe("chromium");
    expect(identity.parallel).toBe("Refractor");
  });
});
