import { describe, expect, it } from "vitest";
import { distributionFromRange } from "./gradeProbability";

function probabilityFor(outcomes: { label: string; probability: number }[], label: string): number {
  return outcomes.find((outcome) => outcome.label === label)?.probability ?? 0;
}

describe("distributionFromRange", () => {
  it("maps PSA 8-9 at medium confidence", () => {
    const outcomes = distributionFromRange("PSA 8-9");

    expect(probabilityFor(outcomes, "PSA 8")).toBeCloseTo(0.35, 4);
    expect(probabilityFor(outcomes, "PSA 9")).toBeCloseTo(0.65, 4);
  });

  it("adjusts 9-10 range by confidence", () => {
    const lowConfidence = distributionFromRange("PSA 9-10", "low");
    expect(probabilityFor(lowConfidence, "PSA 9")).toBeCloseTo(0.6, 4);
    expect(probabilityFor(lowConfidence, "PSA 10")).toBeCloseTo(0.4, 4);

    const highConfidence = distributionFromRange("PSA 9-10", "high");
    expect(probabilityFor(highConfidence, "PSA 9")).toBeCloseTo(0.8, 4);
    expect(probabilityFor(highConfidence, "PSA 10")).toBeCloseTo(0.2, 4);
  });

  it("caps PSA 10 single grade at 60%", () => {
    const outcomes = distributionFromRange("PSA 10");

    expect(probabilityFor(outcomes, "PSA 10")).toBeCloseTo(0.6, 4);
    expect(probabilityFor(outcomes, "PSA 9")).toBeCloseTo(0.4, 4);
  });

  it("handles weird input formatting", () => {
    const spaced = distributionFromRange("8 \u2013 9");
    expect(probabilityFor(spaced, "PSA 8")).toBeCloseTo(0.35, 4);

    const compact = distributionFromRange("PSA8-9");
    expect(probabilityFor(compact, "PSA 9")).toBeCloseTo(0.65, 4);
  });
});
