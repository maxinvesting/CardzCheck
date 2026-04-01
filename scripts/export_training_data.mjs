#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const DEFAULT_FEATURE_VERSION = "v1";
const DEFAULT_GRADER = "psa";
const PAGE_SIZE = 1000;

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

function normalizePsaLabel(labelText, numericValue) {
  const lower = String(labelText || "").toLowerCase().trim();
  if (lower === "10" || lower.includes("psa 10")) return "10";
  if (lower === "9" || lower.includes("psa 9")) return "9";
  if (lower === "8" || lower.includes("psa 8")) return "8";
  if (lower === "7_or_lower" || lower === "7 or lower") return "7_or_lower";

  const numeric = Number(numericValue);
  if (Number.isFinite(numeric)) {
    if (numeric >= 9.5) return "10";
    if (numeric >= 8.5) return "9";
    if (numeric >= 7.5) return "8";
    return "7_or_lower";
  }

  return null;
}

function escapeCsvCell(value) {
  if (value === null || value === undefined) return "";
  const raw = String(value);
  if (!/[",\n]/.test(raw)) return raw;
  return `"${raw.replace(/"/g, '""')}"`;
}

async function fetchPaged(queryFactory) {
  const rows = [];
  let offset = 0;

  while (true) {
    const { data, error } = await queryFactory(offset, offset + PAGE_SIZE - 1);
    if (error) {
      throw new Error(`${error.code || "supabase_error"}: ${error.message}`);
    }

    const page = Array.isArray(data) ? data : [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return rows;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const featureVersion = String(args.featureVersion || DEFAULT_FEATURE_VERSION);
  const grader = String(args.grader || DEFAULT_GRADER).toLowerCase();
  const outputPrefix = String(
    args.outputPrefix ||
      path.join(
        "tmp",
        `grading_training_${new Date().toISOString().slice(0, 10)}_${featureVersion}_${grader}`
      )
  );

  const supabaseUrl = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const supabaseServiceRole = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");

  const supabase = createClient(supabaseUrl, supabaseServiceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const [featureRows, labelRows] = await Promise.all([
    fetchPaged((from, to) =>
      supabase
        .from("grade_scan_features")
        .select("scan_id,user_id,feature_version,features_json,created_at")
        .eq("feature_version", featureVersion)
        .order("created_at", { ascending: false })
        .range(from, to)
    ),
    fetchPaged((from, to) =>
      supabase
        .from("grade_scan_labels")
        .select("scan_id,user_id,grader,label_text,label_grade_numeric,created_at")
        .eq("grader", grader)
        .order("created_at", { ascending: false })
        .range(from, to)
    ),
  ]);

  const latestLabelByScan = new Map();
  for (const row of labelRows) {
    if (!row || typeof row.scan_id !== "string") continue;
    if (!latestLabelByScan.has(row.scan_id)) {
      latestLabelByScan.set(row.scan_id, row);
    }
  }

  const dataset = [];
  const dropped = {
    missing_label: 0,
    invalid_label: 0,
    invalid_features: 0,
  };

  for (const featureRow of featureRows) {
    if (!featureRow || typeof featureRow.scan_id !== "string") continue;

    const labelRow = latestLabelByScan.get(featureRow.scan_id);
    if (!labelRow) {
      dropped.missing_label += 1;
      continue;
    }

    const normalizedLabel =
      grader === "psa"
        ? normalizePsaLabel(labelRow.label_text, labelRow.label_grade_numeric)
        : String(labelRow.label_text || "").trim() || null;

    if (!normalizedLabel) {
      dropped.invalid_label += 1;
      continue;
    }

    const features = featureRow.features_json;
    if (!features || typeof features !== "object" || Array.isArray(features)) {
      dropped.invalid_features += 1;
      continue;
    }

    dataset.push({
      scan_id: featureRow.scan_id,
      user_id: featureRow.user_id,
      feature_version: featureRow.feature_version,
      label: normalizedLabel,
      label_text_raw: labelRow.label_text,
      label_grade_numeric: labelRow.label_grade_numeric,
      feature_created_at: featureRow.created_at,
      label_created_at: labelRow.created_at,
      features,
    });
  }

  await fs.mkdir(path.dirname(outputPrefix), { recursive: true });

  const jsonlPath = `${outputPrefix}.jsonl`;
  const csvPath = `${outputPrefix}.csv`;

  const jsonl = dataset.map((row) => JSON.stringify(row)).join("\n");
  await fs.writeFile(jsonlPath, jsonl.length > 0 ? `${jsonl}\n` : "", "utf8");

  const featureKeys = Array.from(
    dataset.reduce((set, row) => {
      for (const key of Object.keys(row.features || {})) {
        set.add(key);
      }
      return set;
    }, new Set())
  ).sort();

  const csvHeaders = [
    "scan_id",
    "user_id",
    "feature_version",
    "label",
    "label_text_raw",
    "label_grade_numeric",
    ...featureKeys,
  ];

  const csvLines = [csvHeaders.join(",")];
  for (const row of dataset) {
    const cells = [
      row.scan_id,
      row.user_id,
      row.feature_version,
      row.label,
      row.label_text_raw,
      row.label_grade_numeric,
      ...featureKeys.map((key) => row.features[key]),
    ].map(escapeCsvCell);

    csvLines.push(cells.join(","));
  }
  await fs.writeFile(csvPath, `${csvLines.join("\n")}\n`, "utf8");

  console.log("Export complete");
  console.log(JSON.stringify(
    {
      feature_version: featureVersion,
      grader,
      feature_rows: featureRows.length,
      label_rows: labelRows.length,
      training_rows: dataset.length,
      dropped,
      jsonl: jsonlPath,
      csv: csvPath,
    },
    null,
    2
  ));
}

main().catch((error) => {
  console.error("Export failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
