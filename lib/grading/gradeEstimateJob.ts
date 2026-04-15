import type { CardIdentity } from "@/lib/card-identity/types";
import type { GradeOutcome } from "@/lib/grading/gradeProbability";
import type { GradeEstimate, GradeScanPhoto, WorthGradingResult } from "@/types";
import type { GradeEstimatorCardInput } from "@/lib/grade-estimator/value";
import type { ImageStats } from "@/lib/grading/fallbackEstimate";
import type { GradeScanCardMeta } from "@/lib/grading/gradeFeatures";

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

export type GradeEstimateModelUsage = {
  inputTokens: number;
  outputTokens: number;
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
  kind: GradeScanPhoto["kind"];
  originalUrl: string;
};

export type GradeEstimateJobInput = {
  scanPhotos: GradeScanPhoto[];
  card?: GradeEstimatorCardInput | null;
  /** User observations typed before the scan — injected into the AI prompt as initial context */
  preScanNotes?: string;
  /** User-supplied correction text to inject into the grade model prompt */
  correctionText?: string;
  /** Skip OCR identity step — use priorIdentity instead (for refinement re-runs) */
  skipOcrIdentity?: boolean;
  /** Pre-known identity to inject when skipOcrIdentity is true */
  priorIdentity?: CardIdentity;
};

export type GradeEstimateJobDependencies = {
  resolveImages: (
    scanPhotos: GradeScanPhoto[]
  ) => Promise<{
    resolvedImages: ResolvedGradeEstimateImage[];
    imageStats: ImageStats;
  }>;
  runOcrIdentity: (images: ResolvedGradeEstimateImage[]) => Promise<CardIdentity>;
  runGradeModel: (
    images: ResolvedGradeEstimateImage[],
    identity?: CardIdentity | null,
    correctionText?: string,
    preScanNotes?: string
  ) => Promise<{ text: string | null; usage: GradeEstimateModelUsage | null }>;
  parseModelOutput: (options: {
    modelText: string | null;
    imageStats: ImageStats;
    scanPhotoKinds: GradeScanPhoto["kind"][];
    cardMeta?: GradeScanCardMeta | null;
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
      modelUsage?: GradeEstimateModelUsage | null;
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
    sport: identity.sport ?? undefined,
    game: identity.sport ?? undefined,
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
  if (input.skipOcrIdentity && input.priorIdentity) {
    // Refinement path: skip OCR, resolve images only, inject prior identity
    const ocrStart = startStep(job, "ocr_identity");
    try {
      const { resolvedImages, imageStats } = await deps.resolveImages(input.scanPhotos);
      job.internal.resolvedImages = resolvedImages;
      job.internal.imageStats = imageStats;
      job.partial.identity = input.priorIdentity;
      skipStep(job, "ocr_identity", "Skipped for refinement");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to resolve images";
      finishStep(job, "ocr_identity", ocrStart, "error", message);
      job.status = "error";
      job.error = message;
      updateTimestamp(job);
      return;
    }
  } else {
    const ocrStart = startStep(job, "ocr_identity");
    try {
      const { resolvedImages, imageStats } = await deps.resolveImages(input.scanPhotos);
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
  }

  // Step 2: grade model
  const gradeStart = startStep(job, "grade_model");
  try {
    const resolvedImages = job.internal.resolvedImages ?? [];
    // Pass identity so the grade model can apply card-type context (chrome, vintage, etc.)
    // Pass correctionText when refining and preScanNotes when the user typed pre-scan context.
    const modelResult = await deps.runGradeModel(
      resolvedImages,
      job.partial.identity,
      input.correctionText,
      input.preScanNotes
    );
    job.internal.modelText = modelResult.text;
    job.internal.modelUsage = modelResult.usage;
    finishStep(job, "grade_model", gradeStart, "done");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to analyze condition";
    job.internal.modelText = null;
    job.internal.modelUsage = null;
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
      scanPhotoKinds: input.scanPhotos.map((photo) => photo.kind),
      cardMeta: {
        game:
          job.partial.identity?.sport ??
          input.card?.game ??
          input.card?.sport ??
          null,
        sport:
          job.partial.identity?.sport ??
          input.card?.sport ??
          input.card?.game ??
          null,
        player_name:
          job.partial.identity?.player ?? input.card?.player_name ?? null,
        year:
          job.partial.identity?.year ??
          (input.card?.year && Number.isFinite(Number(input.card.year))
            ? Number(input.card.year)
            : null),
        set_name: job.partial.identity?.setName ?? input.card?.set_name ?? null,
        chrome: job.partial.identity
          ? job.partial.identity.cardStock === "chromium"
          : null,
        title:
          [input.card?.year, input.card?.set_name, input.card?.player_name]
            .filter(Boolean)
            .join(" ") || null,
      },
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
