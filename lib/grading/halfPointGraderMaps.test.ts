import { describe, expect, it } from "vitest";
import {
  deriveHalfPointGradersFromPsa,
  mapPsaToBgs,
  mapPsaToCgc,
  mapPsaToSgc,
  mapPsaToTag,
} from "./halfPointGraderMaps";
import type { GradeProbabilities } from "@/types";

function sumDist(m: Record<string, number>): number {
  return Object.values(m).reduce((s, v) => s + v, 0);
}

describe("halfPointGraderMaps", () => {
  const evenPsa: GradeProbabilities["psa"] = {
    "10": 0.25,
    "9": 0.25,
    "8": 0.25,
    "7_or_lower": 0.25,
  };

  it("each mapper produces distributions summing to ~1", () => {
    expect(sumDist(mapPsaToBgs(evenPsa))).toBeCloseTo(1, 5);
    expect(sumDist(mapPsaToCgc(evenPsa))).toBeCloseTo(1, 5);
    expect(sumDist(mapPsaToSgc(evenPsa))).toBeCloseTo(1, 5);
    expect(sumDist(mapPsaToTag(evenPsa))).toBeCloseTo(1, 5);
  });

  it("deriveHalfPointGradersFromPsa preserves normalized bgs input", () => {
    const bgs = mapPsaToBgs(evenPsa);
    const out = deriveHalfPointGradersFromPsa(evenPsa, bgs);
    expect(sumDist(out.bgs)).toBeCloseTo(1, 5);
    expect(out.bgs["9.5"]).toBeCloseTo(bgs["9.5"], 5);
    expect(sumDist(out.cgc)).toBeCloseTo(1, 5);
    expect(sumDist(out.sgc)).toBeCloseTo(1, 5);
    expect(sumDist(out.tag)).toBeCloseTo(1, 5);
  });

  it("CGC top tier is stricter than SGC for PSA 10-heavy input", () => {
    const psa10: GradeProbabilities["psa"] = {
      "10": 0.9,
      "9": 0.08,
      "8": 0.02,
      "7_or_lower": 0,
    };
    const cgc = mapPsaToCgc(psa10);
    const sgc = mapPsaToSgc(psa10);
    expect(cgc["9.5"]).toBeLessThan(sgc["9.5"]);
  });
});
