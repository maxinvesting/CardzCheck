#!/usr/bin/env node
import fs from "node:fs/promises";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const [rawKey, rawValue] = token.slice(2).split("=");
    if (rawValue !== undefined) {
      args[rawKey] = rawValue;
      continue;
    }
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[rawKey] = "true";
      continue;
    }
    args[rawKey] = next;
    i += 1;
  }
  return args;
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

async function readJson(path) {
  const text = await fs.readFile(path, "utf8");
  return JSON.parse(text);
}

function inferVersion(args) {
  if (typeof args.version === "string" && args.version.trim()) {
    return args.version.trim();
  }
  const day = new Date().toISOString().slice(0, 10);
  return `${day}_manual`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const modelFile = args.modelFile || args.model;
  if (!modelFile) {
    throw new Error("--modelFile is required");
  }

  const metricsFile = args.metricsFile || args.metrics || null;
  const modelJson = await readJson(modelFile);
  const metricsJson = metricsFile ? await readJson(metricsFile) : {};

  const modelKey = String(args.modelKey || modelJson.model_key || "psa_calibrator");
  const version = inferVersion(args);
  const featureVersion = String(
    args.featureVersion || modelJson.feature_version || "v1"
  );
  const modelType = String(args.modelType || modelJson.model_type || "logreg");
  const activate = String(args.activate || "false").toLowerCase() === "true";

  const supabase = createClient(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: { persistSession: false, autoRefreshToken: false },
    }
  );

  if (activate) {
    const { error: deactivateError } = await supabase
      .from("grade_model_versions")
      .update({ is_active: false })
      .eq("model_key", modelKey)
      .eq("is_active", true);

    if (deactivateError) {
      throw new Error(
        `Failed to deactivate existing active model: ${deactivateError.code || ""} ${deactivateError.message}`
      );
    }
  }

  const { data, error } = await supabase
    .from("grade_model_versions")
    .upsert(
      {
        model_key: modelKey,
        version,
        feature_version: featureVersion,
        model_type: modelType,
        model_json: modelJson,
        metrics_json: metricsJson,
        is_active: activate,
      },
      { onConflict: "model_key,version" }
    )
    .select("id,model_key,version,feature_version,model_type,is_active,created_at")
    .single();

  if (error) {
    throw new Error(`Upload failed: ${error.code || ""} ${error.message}`);
  }

  console.log("Model version uploaded");
  console.log(
    JSON.stringify(
      {
        id: data.id,
        model_key: data.model_key,
        version: data.version,
        feature_version: data.feature_version,
        model_type: data.model_type,
        is_active: data.is_active,
        created_at: data.created_at,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
