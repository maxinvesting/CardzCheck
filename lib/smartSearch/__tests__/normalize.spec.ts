import { describe, it, expect } from "vitest";
import { extractBrandAndLine, extractParallel } from "../normalize";

describe("normalize helpers", () => {
  it("extracts Donruss / Optic from Donruss Optic Football titles", () => {
    const fromSet = extractBrandAndLine("Donruss Optic Football");
    expect(fromSet.brand).toBe("Donruss");
    expect(fromSet.line).toBe("Optic");

    const fromTitle = extractBrandAndLine("2024 Donruss Optic Drake Maye Rated Rookie");
    expect(fromTitle.brand).toBe("Donruss");
    expect(fromTitle.line).toBe("Optic");
  });

  it("distinguishes Prizm vs Select", () => {
    const prizm = extractBrandAndLine("Panini Prizm Football");
    expect(prizm.line).toBe("Prizm");

    const select = extractBrandAndLine("Panini Select Football");
    expect(select.line).toBe("Select");
  });

  it("distinguishes Optic vs Contenders", () => {
    const optic = extractBrandAndLine("Panini Donruss Optic");
    expect(optic.line).toBe("Optic");

    const contenders = extractBrandAndLine("Panini Contenders");
    expect(contenders.line).toBe("Contenders");
  });

  it("extracts common parallel names like Silver Prizm and Downtown", () => {
    const silver = extractParallel("2024 Donruss Optic Drake Maye Silver Prizm");
    expect(silver?.toLowerCase()).toContain("silver");

    const downtown = extractParallel("Drake Maye Downtown Case Hit");
    expect(downtown?.toLowerCase()).toContain("downtown");
  });
});

