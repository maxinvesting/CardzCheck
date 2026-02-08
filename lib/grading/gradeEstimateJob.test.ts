import { describe, expect, it } from "vitest";
import {
  createGradeEstimateJobState,
  runGradeEstimateJob,
  type GradeEstimateJobDependencies,
} from "./gradeEstimateJob";
import type { CardIdentity } from "@/lib/card-identity/types";
import type { GradeEstimate, WorthGradingResult } from "@/types";

const baseIdentity: CardIdentity = {
  player: "Test Player",
  year: 2020,
  brand: "Topps",
  setName: "Chrome",
  subset: null,
  sport: "Baseball",
  league: "MLB",
  cardNumber: "12",
  rookie: false,
  parallel: null,
  cardStock: "paper",
  confidence: "high",
  fieldConfidence: {},
  sources: {},
  warnings: [],
  evidenceSummary: null,
};

const baseEstimate: GradeEstimate = {
  estimated_grade_low: 8,
  estimated_grade_high: 9,
  centering: "Centered",
  corners: "Sharp",
  surface: "Clean",
  edges: "Clean",
  grade_notes: "Notes",
  grade_probabilities: {
    psa: { "10": 0.2, "9": 0.5, "8": 0.2, "7_or_lower": 0.1 },
    bgs: { "9.5": 0.2, "9": 0.5, "8.5": 0.2, "8_or_lower": 0.1 },
    confidence: "high",
  },
  analysis_status: "ok",
};

const baseWorth: WorthGradingResult = {
  raw: { price: 100, n: 5, method: "median" },
  psa: {
    "10": { price: 200, n: 4, method: "median" },
    "9": { price: 150, n: 4, method: "median" },
    "8": { price: 120, n: 4, method: "median" },
    ev: 150,
    netGain: 30,
    roi: 0.2,
  },
  bgs: {
    "9.5": { price: 190, n: 4, method: "median" },
    "9": { price: 140, n: 4, method: "median" },
    "8.5": { price: 115, n: 4, method: "median" },
    ev: 145,
    netGain: 25,
    roi: 0.18,
  },
  bestOption: "psa",
  rating: "yes",
  confidence: "medium",
  explanation: "PSA looks best.",
};

function buildDeps(overrides?: Partial<GradeEstimateJobDependencies>): GradeEstimateJobDependencies {
  return {
    resolveImages: async () => ({
      resolvedImages: [
        {
          base64Image: "abc",
          mediaType: "image/jpeg",
          bytes: 10,
          source: "base64",
        },
      ],
      imageStats: { count: 1, avgBytes: 10, maxBytes: 10, minBytes: 10 },
    }),
    runOcrIdentity: async () => baseIdentity,
    runGradeModel: async () => "{}",
    parseModelOutput: async () => ({
      estimate: baseEstimate,
      probabilities: [
        { label: "PSA 10", probability: 0.2 },
        { label: "PSA 9", probability: 0.5 },
      ],
      evidence: {
        centering: baseEstimate.centering,
        corners: baseEstimate.corners,
        surface: baseEstimate.surface,
        edges: baseEstimate.edges,
        grade_notes: baseEstimate.grade_notes,
      },
      preliminaryRange: "PSA 8-9",
    }),
    runPostGradingValue: async () => baseWorth,
    ...overrides,
  };
}

describe("grade estimate job", () => {
  it("transitions from queued to done", async () => {
    const job = createGradeEstimateJobState({ jobId: "job-1", now: Date.now() });
    const deps = buildDeps();

    expect(job.status).toBe("queued");

    await runGradeEstimateJob(job, { imageUrls: ["data:image/jpeg;base64,abc"] }, deps);

    expect(job.status).toBe("done");
    expect(job.steps.ocr_identity.status).toBe("done");
    expect(job.steps.grade_model.status).toBe("done");
    expect(job.steps.parse_validate.status).toBe("done");
  });

  it("publishes identity before probabilities are ready", async () => {
    const job = createGradeEstimateJobState({ jobId: "job-2", now: Date.now() });
    let resolveModel: ((value: string) => void) | undefined;
    const modelPromise = new Promise<string>((resolve) => {
      resolveModel = resolve;
    });

    const deps = buildDeps({
      runGradeModel: async () => modelPromise,
    });

    const runPromise = runGradeEstimateJob(job, { imageUrls: ["data:image/jpeg;base64,abc"] }, deps);

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(job.partial.identity?.player).toBe("Test Player");
    expect(job.final).toBeNull();

    resolveModel?.("{}");
    await runPromise;

    expect(job.final?.probabilities).toBeTruthy();
  });

  it("does not fail the job when post grading value errors", async () => {
    const job = createGradeEstimateJobState({ jobId: "job-3", now: Date.now() });
    const deps = buildDeps({
      runPostGradingValue: async () => {
        throw new Error("market down");
      },
    });

    await runGradeEstimateJob(job, { imageUrls: ["data:image/jpeg;base64,abc"] }, deps);

    expect(job.status).toBe("done");
    expect(job.steps.post_grading_value.status).toBe("error");
    expect(job.error).toBeNull();
  });
});
