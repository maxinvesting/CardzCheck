import "server-only";

import {
  createGradeEstimateJobState,
  type GradeEstimateJobState,
} from "@/lib/grading/gradeEstimateJob";

const STORE_KEY = "__grade_estimate_job_store__";
const TTL_MS = 30 * 60 * 1000;

type JobStore = Map<string, GradeEstimateJobState>;

function getStore(): JobStore {
  const globalStore = globalThis as { [STORE_KEY]?: JobStore };
  if (!globalStore[STORE_KEY]) {
    globalStore[STORE_KEY] = new Map();
  }
  return globalStore[STORE_KEY]!;
}

function cleanupExpiredJobs(store: JobStore) {
  const now = Date.now();
  for (const [jobId, job] of store.entries()) {
    if (job.expiresAt <= now) {
      store.delete(jobId);
    }
  }
}

export function createGradeEstimateJob(): GradeEstimateJobState {
  const store = getStore();
  cleanupExpiredJobs(store);
  const job = createGradeEstimateJobState({ ttlMs: TTL_MS });
  store.set(job.jobId, job);
  return job;
}

export function getGradeEstimateJob(jobId: string): GradeEstimateJobState | null {
  const store = getStore();
  cleanupExpiredJobs(store);
  return store.get(jobId) ?? null;
}
