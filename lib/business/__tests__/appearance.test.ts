import { describe, expect, it } from "vitest";
import {
  DEFAULT_BUSINESS_APPEARANCE,
  getBusinessAppearanceCssVariables,
  normalizeBusinessAppearance,
  normalizeHexColor,
  parseBusinessAppearanceInput,
} from "@/lib/business/appearance";

describe("business appearance helpers", () => {
  it("normalizes valid hex colors and rejects invalid values", () => {
    expect(normalizeHexColor(" #1d9e75 ")).toBe("#1D9E75");
    expect(normalizeHexColor("#ABCDEF")).toBe("#ABCDEF");
    expect(normalizeHexColor("#abcd")).toBeNull();
    expect(normalizeHexColor("green")).toBeNull();
    expect(normalizeHexColor(null)).toBeNull();
  });

  it("fills missing palette values with defaults", () => {
    expect(
      normalizeBusinessAppearance({
        primaryColor: "#123456",
        tertiaryColor: "bad-input",
      })
    ).toEqual({
      primaryColor: "#123456",
      secondaryColor: DEFAULT_BUSINESS_APPEARANCE.secondaryColor,
      tertiaryColor: DEFAULT_BUSINESS_APPEARANCE.tertiaryColor,
    });
  });

  it("parses reset requests and validates full palette payloads", () => {
    expect(parseBusinessAppearanceInput({ reset: true })).toEqual({
      appearance: DEFAULT_BUSINESS_APPEARANCE,
      error: null,
      reset: true,
    });

    expect(
      parseBusinessAppearanceInput({
        primaryColor: "#1d9e75",
        secondaryColor: "#15803d",
        tertiaryColor: "#0f766e",
      })
    ).toEqual({
      appearance: {
        primaryColor: "#1D9E75",
        secondaryColor: "#15803D",
        tertiaryColor: "#0F766E",
      },
      error: null,
      reset: false,
    });

    expect(
      parseBusinessAppearanceInput({
        primaryColor: "#1D9E75",
        secondaryColor: "#ZZZZZZ",
        tertiaryColor: "#0F766E",
      })
    ).toEqual({
      appearance: null,
      error:
        "primaryColor, secondaryColor, and tertiaryColor must be valid #RRGGBB values",
      reset: false,
    });
  });

  it("derives semantic business CSS variables from the palette", () => {
    const vars = getBusinessAppearanceCssVariables({
      primaryColor: "#336699",
      secondaryColor: "#22AA44",
      tertiaryColor: "#8844CC",
    });

    expect(vars["--biz-primary"]).toBe("#336699");
    expect(vars["--biz-primary-hover"]).toBe("#2D5A87");
    expect(vars["--biz-primary-soft"]).toBe("rgba(51, 102, 153, 0.100)");
    expect(vars["--biz-link"]).toBe("#336699");
    expect(vars["--biz-focus"]).toBe("rgba(51, 102, 153, 0.220)");
    expect(vars["--biz-secondary"]).toBe("#22AA44");
    expect(vars["--biz-tertiary"]).toBe("#8844CC");
    expect(vars["--biz-primary-foreground"]).toBe("#FFFFFF");
  });
});
