import { describe, expect, it } from "vitest";
import modernPanini from "./fixtures/modern-panini-football-2025.json";
import toppsBaseball from "./fixtures/topps-baseball.json";
import toppsBasketball from "./fixtures/topps-basketball-cooper-flagg.json";
import vintageBaseball from "./fixtures/vintage-baseball.json";
import { buildCardIdentityFromSignals, buildOcrSignals, __testing } from "@/lib/card-identity/normalize";
import { parseFirstJsonObject } from "@/lib/card-identity/json";

function buildIdentityFromFixture(fixture: { ocrLines: string[]; vision: any }) {
  const ocr = buildOcrSignals(fixture.ocrLines.map((text) => ({ text })));
  return buildCardIdentityFromSignals(ocr, fixture.vision, 2026);
}

describe("CardIdentity year extraction", () => {
  it("accepts and preserves 2025 from OCR+vision", () => {
    const identity = buildIdentityFromFixture(modernPanini);
    expect(identity.year).toBe(2025);
    expect(identity.fieldConfidence.year).toBe("high");
  });

  it("handles Topps baseball fixtures", () => {
    const identity = buildIdentityFromFixture(toppsBaseball);
    expect(identity.year).toBe(2023);
    expect(identity.setName).toContain("Topps");
  });

  it("handles Topps basketball (Cooper Flagg) fixtures", () => {
    const identity = buildIdentityFromFixture(toppsBasketball);
    expect(identity.year).toBe(2025);
    expect(identity.player).toBe("Cooper Flagg");
    expect(identity.fieldConfidence.player).toBe("high");
    expect(identity.sources.player).toBe("ocr");
  });

  it("handles vintage baseball fixtures", () => {
    const identity = buildIdentityFromFixture(vintageBaseball);
    expect(identity.year).toBe(1986);
  });

  it("marks ambiguous years as undefined with a warning", () => {
    const ocr = buildOcrSignals([
      { text: "© 2024 Panini America, Inc." },
      { text: "© 2025 Panini America, Inc." },
    ]);
    const identity = buildCardIdentityFromSignals(
      ocr,
      {
        player: "Player",
        setName: "Panini Prizm",
        brand: "Panini",
        year: null,
        confidence: "low",
        fieldConfidence: { year: "low" },
      },
      2026
    );
    expect(identity.year).toBeUndefined();
    expect(identity.warnings).toContain("year_ambiguous");
  });

  it("does not override confident OCR year on catalog mismatch", () => {
    const ocr = buildOcrSignals([{ text: "© 2025 Topps Company, Inc." }]);
    const identity = buildCardIdentityFromSignals(
      ocr,
      {
        player: "Player",
        brand: "Topps",
        setName: "Topps Chrome",
        year: 2025,
        confidence: "high",
        fieldConfidence: { year: "high", setName: "high" },
      },
      2026
    );
    expect(identity.year).toBe(2025);
    expect(identity.warnings).toContain("catalog_mismatch");
  });

  it("prefers higher-scoring OCR year lines", () => {
    const candidates = __testing.parseYearCandidates(
      "© 2025 Panini America, Inc.\n2024 Season"
    );
    const pick = __testing.pickTopYearCandidate(candidates, 2026);
    expect(pick.year).toBe(2025);
  });

  it("parses mixed text + JSON without throwing", () => {
    const input = "Some header text {\"year\": 2025, \"player\": \"Name\"} trailing";
    const parsed = parseFirstJsonObject(input);
    expect(parsed.value).toEqual({ year: 2025, player: "Name" });
  });

  it("keeps OCR player when year is unknown", () => {
    const ocr = buildOcrSignals([{ text: "COOPER FLAGG" }]);
    const identity = buildCardIdentityFromSignals(
      ocr,
      {
        player: null,
        year: null,
        confidence: "low",
        fieldConfidence: { year: "low" },
      },
      2026
    );
    expect(identity.player).toBe("Cooper Flagg");
    expect(identity.fieldConfidence.player).toBe("high");
    expect(identity.sources.player).toBe("ocr");
  });

  it("prefers high-confidence OCR player over vision conflict", () => {
    const ocr = buildOcrSignals([{ text: "COOPER FLAGG" }]);
    const identity = buildCardIdentityFromSignals(
      ocr,
      {
        player: "Luka Doncic",
        brand: "Panini",
        setName: "Court Kings",
        year: 2025,
        confidence: "high",
        fieldConfidence: { player: "high", year: "high", setName: "medium" },
      },
      2026
    );
    expect(identity.player).toBe("Cooper Flagg");
    expect(identity.sources.player).toBe("ocr");
  });
});
