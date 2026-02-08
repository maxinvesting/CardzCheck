import type { CardIdentity } from "@/lib/card-identity/types";
import type { GradeOutcome } from "@/lib/grading/gradeProbability";
import type { GradeEstimate, WorthGradingResult } from "@/types";
import type { GradeEstimatorCardInput } from "@/lib/grade-estimator/value";
import type { ImageStats } from "@/lib/grading/fallbackEstimate";

export type GradeEstimateJobStatus = "queued" | "running" | "done" | "error";
export type GradeEstimateJobStepStatus =
  | "queued"
  | "running"
  | "done"
  | "error"
  | "skipped";

export type GradeEstimateJobStep = {
  status: GradeEstimateJobStepStatus;
  startedAt?: number;
  finishedAt?: number;
  ms?: number;
  error?: string;
  result?: unknown;
};

export type GradeEstimateJobSteps = {
  ocr_identity: GradeEstimateJobStep;
  grade_model: GradeEstimateJobStep;
  parse_validate: GradeEstimateJobStep;
  post_grading_value: GradeEstimateJobStep;
};

export type GradeEstimateEvidence = {
  centering: string;
  corners: string;
  surface: string;
  edges: string;
  grade_notes: string;
};

export type GradeEstimateJobPartial = {
  identity?: CardIdentity;
  preliminaryRange?: string | null;
  probabilities?: GradeOutcome[] | null;
  evidence?: GradeEstimateEvidence | null;
};

export type GradeEstimateJobFinal = GradeEstimateJobPartial & {
  postGradingValue?: WorthGradingResult | null;
  estimate?: GradeEstimate;
};

export type GradeEstimateJobStatusResponse = {
  jobId: string;
  status: GradeEstimateJobStatus;
  startedAt?: number;
  finishedAt?: number;
  steps: GradeEstimateJobSteps;
  partial: GradeEstimateJobPartial;
  final?: GradeEstimateJobFinal | null;
  error?: string | null;
};

export type ResolvedGradeEstimateImage = {
  base64Image: string;
  mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
  bytes: number;
  source: "url" | "base64";
};

export type GradeEstimateJobInput = {
  imageUrls: string[];
  card?: GradeEstimatorCardInput | null;
};

export type GradeEstimateJobDependencies = {
  resolveImages: (
    imageUrls: string[]
  ) => Promise<{
    resolvedImages: ResolvedGradeEstimateImage[];
    imageStats: ImageStats;
  }>;
  runOcrIdentity: (images: ResolvedGradeEstimateImage[]) => Promise<CardIdentity>;
  runGradeModel: (images: ResolvedGradeEstimateImage[]) => Promise<string | null>;
  parseModelOutput: (options: {
    modelText: string | null;
    imageStats: ImageStats;
  }) => Promise<{
    estimate: GradeEstimate;
    probabilities: GradeOutcome[] | null;
    evidence: GradeEstimateEvidence;
    preliminaryRange: string | null;
  }>;
  runPostGradingValue?: (options: {
    card: GradeEstimatorCardInput;
    gradeEstimate: GradeEstimate;
  }) => Promise<WorthGradingResult>;
};

export type GradeEstimateJobState = GradeEstimateJobStatusResponse & {
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  internal: {
    resolvedImages?: ResolvedGradeEstimateImage[];
    imageStats?: ImageStats;
    modelText?: string | null;
  };
};

export function createGradeEstimateJobState(options?: {
  jobId?: string;
  now?: number;
  ttlMs?: number;
}): GradeEstimateJobState {
  const now = options?.now ?? Date.now();
  const ttlMs = options?.ttlMs ?? 30 * 60 * 1000;
  const jobId =
    options?.jobId ??
    (typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `job_${now}_${Math.random().toString(36).slice(2, 8)}`);

  return {
    jobId,
    status: "queued",
    startedAt: undefined,
    finishedAt: undefined,
    steps: {
      ocr_identity: { status: "queued" },
      grade_model: { status: "queued" },
      parse_validate: { status: "queued" },
      post_grading_value: { status: "queued" },
    },
    partial: {},
    final: null,
    error: null,
    createdAt: now,
    updatedAt: now,
    expiresAt: now + ttlMs,
    internal: {},
  };
}

function updateTimestamp(job: GradeEstimateJobState) {
  job.updatedAt = Date.now();
}

function startStep(job: GradeEstimateJobState, step: keyof GradeEstimateJobSteps): number {
  const now = Date.now();
  job.steps[step].status = "running";
  job.steps[step].startedAt = now;
  job.steps[step].finishedAt = undefined;
  job.steps[step].ms = undefined;
  job.steps[step].error = undefined;
  updateTimestamp(job);
  return now;
}

function finishStep(
  job: GradeEstimateJobState,
  step: keyof GradeEstimateJobSteps,
  start: number,
  status: GradeEstimateJobStepStatus = "done",
  error?: string
) {
  const finishedAt = Date.now();
  job.steps[step].status = status;
  job.steps[step].finishedAt = finishedAt;
  job.steps[step].ms = finishedAt - start;
  job.steps[step].error = error;
  updateTimestamp(job);
}

function skipStep(job: GradeEstimateJobState, step: keyof GradeEstimateJobSteps, reason?: string) {
  const now = Date.now();
  job.steps[step].status = "skipped";
  job.steps[step].error = reason;
  job.steps[step].startedAt = now;
  job.steps[step].finishedAt = now;
  job.steps[step].ms = undefined;
  updateTimestamp(job);
}

function mapCardInput(identity?: CardIdentity): GradeEstimatorCardInput | null {
  if (!identity?.player) return null;
  return {
    player_name: identity.player,
    year: identity.year ? String(identity.year) : undefined,
    set_name: identity.setName ?? undefined,
    card_number: identity.cardNumber ?? undefined,
    parallel_type: identity.parallel ?? undefined,
  };
}

export async function runGradeEstimateJob(
  job: GradeEstimateJobState,
  input: GradeEstimateJobInput,
  deps: GradeEstimateJobDependencies
): Promise<void> {
  job.startedAt = Date.now();
  job.status = "running";
  updateTimestamp(job);

  // Step 1: OCR identity + image prep
  const ocrStart = startStep(job, "ocr_identity");
  try {
    const { resolvedImages, imageStats } = await deps.resolveImages(input.imageUrls);
    job.internal.resolvedImages = resolvedImages;
    job.internal.imageStats = imageStats;

    const identity = await deps.runOcrIdentity(resolvedImages);
    job.partial.identity = identity;
    finishStep(job, "ocr_identity", ocrStart, "done");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to extract identity";
    finishStep(job, "ocr_identity", ocrStart, "error", message);
    job.status = "error";
    job.error = message;
    updateTimestamp(job);
    return;
  }

  // Step 2: grade model
  const gradeStart = startStep(job, "grade_model");
  try {
    const resolvedImages = job.internal.resolvedImages ?? [];
    const modelText = await deps.runGradeModel(resolvedImages);
    job.internal.modelText = modelText;
    finishStep(job, "grade_model", gradeStart, "done");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to analyze condition";
    job.internal.modelText = null;
    finishStep(job, "grade_model", gradeStart, "error", message);
  }

  // Step 3: parse + validate
  const parseStart = startStep(job, "parse_validate");
  try {
    const imageStats = job.internal.imageStats;
    if (!imageStats) {
      throw new Error("Missing image stats");
    }

    const parsed = await deps.parseModelOutput({
      modelText: job.internal.modelText ?? null,
      imageStats,
    });
    job.partial.preliminaryRange = parsed.preliminaryRange;
    job.partial.probabilities = parsed.probabilities;
    job.partial.evidence = parsed.evidence;
    job.final = {
      identity: job.partial.identity,
      preliminaryRange: parsed.preliminaryRange,
      probabilities: parsed.probabilities,
      evidence: parsed.evidence,
      estimate: parsed.estimate,
    };
    finishStep(job, "parse_validate", parseStart, "done");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to parse analysis";
    finishStep(job, "parse_validate", parseStart, "error", message);
    job.status = "error";
    job.error = message;
    updateTimestamp(job);
    return;
  }

  // Step 4: post grading value (optional)
  const postStart = startStep(job, "post_grading_value");
  try {
    if (!deps.runPostGradingValue) {
      skipStep(job, "post_grading_value", "Skipped");
    } else {
      const estimate = job.final?.estimate;
      const gradeProbabilities = estimate?.grade_probabilities;
      const cardInput = input.card ?? mapCardInput(job.partial.identity);
      if (!estimate || !gradeProbabilities || !cardInput?.player_name) {
        skipStep(job, "post_grading_value", "Skipped");
      } else {
        const result = await deps.runPostGradingValue({
          card: cardInput,
          gradeEstimate: estimate,
        });
        job.final = {
          ...(job.final ?? {}),
          postGradingValue: result,
        };
        finishStep(job, "post_grading_value", postStart, "done");
      }
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Market analysis unavailable";
    finishStep(job, "post_grading_value", postStart, "error", message);
  }

  if ((job as { status: string }).status !== "error") {
    job.status = "done";
    job.finishedAt = Date.now();
    updateTimestamp(job);
  }
}
