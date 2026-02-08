import { describe, it, expect } from "vitest";
import { parseQuery } from "../parseQuery";

describe("parseQuery", () => {
  it('locks year, brand, and line for "2024 donruss optic drake maye"', () => {
    const parsed = parseQuery("2024 donruss optic drake maye");
    expect(parsed.locked.year).toBe("2024");
    expect(parsed.locked.brand).toBeDefined();
    expect(parsed.locked.line).toBeDefined();
    expect(parsed.locked.player?.toLowerCase()).toContain("drake");
  });

  it('does not lock brand/line for simple player-only query "drake maye"', () => {
    const parsed = parseQuery("drake maye");
    expect(parsed.locked.brand).toBeUndefined();
    expect(parsed.locked.line).toBeUndefined();
    expect(parsed.locked.player?.toLowerCase()).toContain("drake");
  });

  it("recognizes card number tokens like #4 and No. 4", () => {
    const a = parseQuery("2024 Donruss Optic Drake Maye #4");
    expect(a.locked.cardNumber).toBe("#4");

    const b = parseQuery("2024 Donruss Optic Drake Maye No. 4");
    expect(b.locked.cardNumber).toBe("#4");
  });

  it("locks popular parallel keywords like silver prizm, downtown, rated rookie", () => {
    const silver = parseQuery("Drake Maye Silver Prizm");
    expect(silver.locked.parallel?.toLowerCase()).toContain("silver");

    const downtown = parseQuery("Drake Maye Downtown");
    expect(downtown.locked.parallel?.toLowerCase()).toContain("downtown");

    const ratedRookie = parseQuery("2024 Donruss Optic Drake Maye Rated Rookie");
    expect(ratedRookie.locked.parallel?.toLowerCase()).toContain("rated rookie");
  });

  it("extracts grader/grade and rookie variation from mixed formats like PSA10 and RC", () => {
    const parsed = parseQuery("2024 C.J. Stroud Panini Prizm RC PSA10");
    expect(parsed.locked.grader).toBe("PSA");
    expect(parsed.locked.grade).toBe("10");
    expect(parsed.signals.variantTokens).toContain("rookie");
  });
});
