import { describe, expect, it } from "vitest";
import {
  buildDeclaredScanPrefaceFromTitle,
  buildParsedCardDetailLine,
  parseGradingCardTitle,
} from "@/lib/grading/cardTitleInput";

describe("cardTitleInput", () => {
  it("parses a free-form sports card title into grading fields", () => {
    const parsed = parseGradingCardTitle("2023 Prizm Victor Wembanyama Silver #136");

    expect(parsed.title).toBe("2023 Prizm Victor Wembanyama Silver #136");
    expect(parsed.player).toBe("Victor Wembanyama");
    expect(parsed.year).toBe("2023");
    expect(parsed.setName).toBe("Prizm");
    expect(parsed.parallel).toBe("Silver");
    expect(parsed.cardNumber).toBe("#136");
  });

  it("builds a structured detail line only when enough fields were parsed", () => {
    expect(buildParsedCardDetailLine("2023 Prizm Victor Wembanyama Silver #136")).toBe(
      "Victor Wembanyama · 2023 · Prizm · Silver · #136"
    );
    expect(buildParsedCardDetailLine("Victor Wembanyama")).toBeNull();
  });

  it("includes the declared title and parsed details in the scan preface", () => {
    expect(
      buildDeclaredScanPrefaceFromTitle({
        cardTitle: "2023 Pokemon 151 Pikachu 151/165",
        gradingCompany: "PSA",
      })
    ).toContain("Declared card title: 2023 Pokemon 151 Pikachu 151/165.");
    expect(
      buildDeclaredScanPrefaceFromTitle({
        cardTitle: "2023 Pokemon 151 Pikachu 151/165",
        gradingCompany: "PSA",
      })
    ).toContain("Parsed details:");
    expect(
      buildDeclaredScanPrefaceFromTitle({
        cardTitle: "2023 Pokemon 151 Pikachu 151/165",
        gradingCompany: "PSA",
      })
    ).toContain("Target grading company: PSA.");
  });
});
