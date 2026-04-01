import { createClient } from "@supabase/supabase-js";
import type { GradeProbabilities } from "@/types";
import { getSupabaseServiceRoleKey, getSupabasePublicEnv } from "@/lib/supabase/env";

export const PSA_CALIBRATOR_MODEL_KEY = "psa_calibrator";

export type SupportedModelType =
  | "logreg"
  | "xgboost"
  | "gbrt"
  | "isotonic"
  | "platt"
  | "rules";

export type ActiveCalibratorRecord = {
  id: string;
  model_key: string;
  version: string;
  feature_version: string;
  model_type: SupportedModelType;
  model_json: unknown;
  metrics_json: unknown;
  is_active: boolean;
  created_at: string;
};

export type LogisticRegressionCalibratorModel = {
  class_labels: string[];
  intercepts:
    | Record<string, number>
    | number[];
  coefficients: Record<string, Record<string, number>>;
  feature_version?: string;
};

type CacheEntry = {
  expiresAt: number;
  value: ActiveCalibratorRecord | null;
};

const cache = new Map<string, CacheEntry>();

function cacheTtlMs(): number {
  const raw = Number(process.env.GRADE_CALIBRATOR_CACHE_TTL_MS ?? "120000");
  if (!Number.isFinite(raw) || raw <= 0) return 120000;
  return Math.round(raw);
}

function getAdminSupabaseClient() {
  const env = getSupabasePublicEnv();
  const serviceRoleKey = getSupabaseServiceRoleKey();
  if (!env || !serviceRoleKey) return null;

  return createClient(env.url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function toNumericFeatureMap(
  features: Record<string, unknown>
): Record<string, number> {
  const numeric: Record<string, number> = {};
  for (const [key, value] of Object.entries(features)) {
    if (typeof value === "number" && Number.isFinite(value)) {
      numeric[key] = value;
      continue;
    }
    if (typeof value === "boolean") {
      numeric[key] = value ? 1 : 0;
      continue;
    }
  }
  return numeric;
}

function parseLogregModel(modelJson: unknown): LogisticRegressionCalibratorModel | null {
  const row = asRecord(modelJson);
  if (!row) return null;

  const classLabels = Array.isArray(row.class_labels)
    ? row.class_labels.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
  if (classLabels.length === 0) return null;

  const coefficientsRaw = asRecord(row.coefficients);
  if (!coefficientsRaw) return null;

  const coefficients: Record<string, Record<string, number>> = {};
  for (const label of classLabels) {
    const byFeatureRaw = asRecord(coefficientsRaw[label]);
    if (!byFeatureRaw) {
      coefficients[label] = {};
      continue;
    }
    const byFeature: Record<string, number> = {};
    for (const [featureName, featureWeight] of Object.entries(byFeatureRaw)) {
      const numeric = toNumber(featureWeight);
      if (numeric !== null) {
        byFeature[featureName] = numeric;
      }
    }
    coefficients[label] = byFeature;
  }

  const interceptsRaw = row.intercepts;
  let intercepts: Record<string, number> | number[] = [];
  if (Array.isArray(interceptsRaw)) {
    intercepts = interceptsRaw
      .map((value) => toNumber(value) ?? 0)
      .slice(0, classLabels.length);
  } else {
    const interceptRecordRaw = asRecord(interceptsRaw);
    const interceptRecord: Record<string, number> = {};
    for (const label of classLabels) {
      interceptRecord[label] = toNumber(interceptRecordRaw?.[label]) ?? 0;
    }
    intercepts = interceptRecord;
  }

  return {
    class_labels: classLabels,
    intercepts,
    coefficients,
    feature_version: typeof row.feature_version === "string" ? row.feature_version : undefined,
  };
}

function softmax(logits: number[]): number[] {
  if (logits.length === 0) return [];
  const max = Math.max(...logits);
  const exps = logits.map((value) => Math.exp(value - max));
  const total = exps.reduce((sum, value) => sum + value, 0);
  if (!Number.isFinite(total) || total <= 0) {
    return logits.map(() => 1 / logits.length);
  }
  return exps.map((value) => value / total);
}

function normalizePsa(probabilities: Record<string, number>): GradeProbabilities["psa"] {
  const row = {
    "10": Math.max(0, probabilities["10"] ?? 0),
    "9": Math.max(0, probabilities["9"] ?? 0),
    "8": Math.max(0, probabilities["8"] ?? 0),
    "7_or_lower": Math.max(0, probabilities["7_or_lower"] ?? 0),
  };

  const total = row["10"] + row["9"] + row["8"] + row["7_or_lower"];
  if (!Number.isFinite(total) || total <= 0) {
    return { "10": 0.05, "9": 0.35, "8": 0.35, "7_or_lower": 0.25 };
  }

  return {
    "10": row["10"] / total,
    "9": row["9"] / total,
    "8": row["8"] / total,
    "7_or_lower": row["7_or_lower"] / total,
  };
}

export async function loadActiveModel(
  modelKey: string
): Promise<ActiveCalibratorRecord | null> {
  const key = modelKey.trim();
  if (!key) return null;

  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const supabase = getAdminSupabaseClient();
  if (!supabase) {
    cache.set(key, { expiresAt: now + cacheTtlMs(), value: null });
    return null;
  }

  try {
    const { data, error } = await supabase
      .from("grade_model_versions")
      .select(
        "id,model_key,version,feature_version,model_type,model_json,metrics_json,is_active,created_at"
      )
      .eq("model_key", key)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[grading-calibrator] failed to load active model", {
          modelKey: key,
          code: error.code,
          message: error.message,
        });
      }
      cache.set(key, { expiresAt: now + cacheTtlMs(), value: null });
      return null;
    }

    const parsed: ActiveCalibratorRecord | null = data
      ? {
          id: String(data.id),
          model_key: String(data.model_key),
          version: String(data.version),
          feature_version: String(data.feature_version),
          model_type: data.model_type as SupportedModelType,
          model_json: data.model_json,
          metrics_json: data.metrics_json,
          is_active: Boolean(data.is_active),
          created_at: String(data.created_at),
        }
      : null;

    cache.set(key, {
      expiresAt: now + cacheTtlMs(),
      value: parsed,
    });
    return parsed;
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[grading-calibrator] unexpected load error", {
        modelKey: key,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    cache.set(key, { expiresAt: now + cacheTtlMs(), value: null });
    return null;
  }
}

export function clearCalibratorCache(modelKey?: string) {
  if (!modelKey) {
    cache.clear();
    return;
  }
  cache.delete(modelKey);
}

export function predictPsaProbabilities(options: {
  modelRecord: ActiveCalibratorRecord;
  features: Record<string, unknown>;
}): GradeProbabilities["psa"] | null {
  const { modelRecord, features } = options;
  if (modelRecord.model_type !== "logreg") return null;

  const parsed = parseLogregModel(modelRecord.model_json);
  if (!parsed) return null;

  const numericFeatures = toNumericFeatureMap(features);
  const logits = parsed.class_labels.map((label, classIndex) => {
    const byFeature = parsed.coefficients[label] ?? {};
    const intercept = Array.isArray(parsed.intercepts)
      ? parsed.intercepts[classIndex] ?? 0
      : parsed.intercepts[label] ?? 0;

    let score = intercept;
    for (const [featureName, weight] of Object.entries(byFeature)) {
      const featureValue = numericFeatures[featureName] ?? 0;
      score += featureValue * weight;
    }
    return score;
  });

  const probs = softmax(logits);
  const byClass: Record<string, number> = {};
  parsed.class_labels.forEach((label, index) => {
    byClass[label] = probs[index] ?? 0;
  });

  return normalizePsa(byClass);
}
