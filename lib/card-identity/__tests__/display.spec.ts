import { describe, expect, it } from "vitest";
import { formatCardSubtitle, getFieldStatus } from "@/lib/card-identity/display";
import type { CardIdentityDisplayInput } from "@/lib/card-identity/display";

function id(overrides: Partial<CardIdentityDisplayInput> = {}): CardIdentityDisplayInput {
  return {
    year: null,
    brand: null,
    setName: null,
    subset: null,
    parallel: null,
    ...overrides,
  };
}

describe("formatCardSubtitle", () => {
  it("formats Topps Chrome Refractor as year • brand setName | parallel", () => {
    expect(
      formatCardSubtitle(id({ year: 2024, brand: "Topps", setName: "Chrome", parallel: "Refractor" }))
    ).toBe("2024 • Topps Chrome | Refractor");
  });

  it("formats Panini Mosaic Base (parallel missing)", () => {
    expect(
      formatCardSubtitle(id({ year: 2025, brand: "Panini", setName: "Mosaic" }))
    ).toBe("2025 • Panini Mosaic");
  });

  it("omits year when missing", () => {
    expect(
      formatCardSubtitle(id({ brand: "Topps", setName: "Chrome", parallel: "Refractor" }))
    ).toBe("Topps Chrome | Refractor");
  });

  it("omits year when confidence is low", () => {
    expect(
      formatCardSubtitle(
        id({
          year: 2024,
          brand: "Topps",
          setName: "Chrome",
          parallel: "Refractor",
          fieldConfidence: { year: "low" },
        })
      )
    ).toBe("Topps Chrome | Refractor");
  });

  it("omits brand when missing", () => {
    expect(
      formatCardSubtitle(id({ year: 2024, setName: "Mosaic", parallel: "Base" }))
    ).toBe("2024 • Mosaic | Base");
  });

  it("omits parallel when missing", () => {
    expect(
      formatCardSubtitle(id({ year: 2024, brand: "Topps", setName: "Chrome" }))
    ).toBe("2024 • Topps Chrome");
  });

  it("uses subset when parallel is missing", () => {
    expect(
      formatCardSubtitle(id({ year: 2024, brand: "Panini", setName: "Prizm", subset: "Silver" }))
    ).toBe("2024 • Panini Prizm | Silver");
  });

  it("does not duplicate brand when setName includes brand", () => {
    expect(
      formatCardSubtitle(id({ year: 2024, brand: "Topps", setName: "Topps Chrome", parallel: "Refractor" }))
    ).toBe("2024 • Topps Chrome | Refractor");
  });

  it("returns only parallel when year and set missing", () => {
    expect(formatCardSubtitle(id({ parallel: "Refractor" }))).toBe("Refractor");
  });

  it("returns empty string for null/undefined identity", () => {
    expect(formatCardSubtitle(null)).toBe("");
    expect(formatCardSubtitle(undefined)).toBe("");
  });

  it("returns empty string when all fields empty", () => {
    expect(formatCardSubtitle(id())).toBe("");
  });

  it("never shows null or extra separators", () => {
    expect(
      formatCardSubtitle(id({ year: 2024, setName: "Prizm", brand: null, parallel: null }))
    ).toBe("2024 • Prizm");
    expect(
      formatCardSubtitle(id({ year: 2024, brand: "Topps", setName: "", parallel: "Refractor" }))
    ).toBe("2024 • Topps | Refractor");
  });
});

describe("getFieldStatus", () => {
  const baseIdentity = { setName: null, parallel: null, brand: null, subset: null };

  it("returns ok when value present and confidence high", () => {
    expect(
      getFieldStatus(
        { ...baseIdentity, year: 2024, fieldConfidence: { year: "high" } },
        "year"
      )
    ).toBe("ok");
  });

  it("returns ok when value present and confidence medium", () => {
    expect(
      getFieldStatus(
        { ...baseIdentity, year: 2024, fieldConfidence: { year: "medium" } },
        "year"
      )
    ).toBe("ok");
  });

  it("returns needs_confirmation when value present but confidence low", () => {
    expect(
      getFieldStatus(
        { ...baseIdentity, year: 2024, fieldConfidence: { year: "low" } },
        "year"
      )
    ).toBe("needs_confirmation");
  });

  it("returns unknown when value null", () => {
    expect(getFieldStatus({ ...baseIdentity, year: null, fieldConfidence: {} }, "year")).toBe("unknown");
  });

  it("returns unknown when identity null", () => {
    expect(getFieldStatus(null, "year")).toBe("unknown");
  });
});
