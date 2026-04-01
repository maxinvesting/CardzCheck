import { describe, expect, it } from "vitest";
import { parseSmartSearch } from "@/lib/smart-search-parser";

describe("parseSmartSearch TCG patterns", () => {
  it("treats Pokemon set-style numbers as card numbers, not serials", () => {
    const parsed = parseSmartSearch("2023 Pokemon 151 Pikachu 151/165 PSA 10");
    expect(parsed.card_number).toBe("#151/165");
    expect(parsed.serial_number).toBeUndefined();
  });

  it("parses One Piece OP card codes as card numbers", () => {
    const parsed = parseSmartSearch("One Piece OP05-119 Luffy");
    expect(parsed.card_number).toBe("#OP05-119");
  });
});
