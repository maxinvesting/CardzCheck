export interface BusinessConsultantReportDataCoverage {
  inventory_count: number;
  sales_count: number;
  missing: string[];
}

export interface BusinessConsultantReportKpi {
  label: string;
  value: string;
  hint: string;
}

export interface BusinessConsultantReportHighRiskPosition {
  item: string;
  cost_basis: number;
  cmv: number;
  delta_pct: number;
  reason: string;
}

export type BusinessConsultantReportEffort = "low" | "medium" | "high";

export interface BusinessConsultantReportRecommendedAction {
  action: string;
  impact: string;
  effort: BusinessConsultantReportEffort;
}

export type BusinessConsultantResponseMode = "report" | "answer";

export interface BusinessConsultantReport {
  response_mode: BusinessConsultantResponseMode;
  report_title: string;
  timestamp: string;
  data_coverage: BusinessConsultantReportDataCoverage;
  answer: string | null;
  key_points: string[];
  kpis: BusinessConsultantReportKpi[];
  high_risk_positions: BusinessConsultantReportHighRiskPosition[];
  recommended_actions: BusinessConsultantReportRecommendedAction[];
  notes: string[];
}

function coerceNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value.replace(/[_ ,]/g, ""));
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function coerceString(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value;
  if (value == null) return fallback;
  try {
    return String(value);
  } catch {
    return fallback;
  }
}

function toArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value == null) return [];
  return [];
}

function extractJsonBlock(text: string): string | null {
  // Prefer fully-fenced ```json ... ``` blocks if present
  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch && fencedMatch[1]) {
    return fencedMatch[1].trim();
  }

  // Strip a leading ```json fence that wasn't closed (truncated output)
  let working = text.replace(/^\s*```(?:json)?\s*/i, "");
  working = working.replace(/\s*```\s*$/i, "");

  const firstBrace = working.indexOf("{");
  if (firstBrace === -1) return null;
  const lastBrace = working.lastIndexOf("}");
  if (lastBrace > firstBrace) {
    return working.slice(firstBrace, lastBrace + 1);
  }
  // No closing brace — return from first brace so repair can attempt to close it
  return working.slice(firstBrace);
}

// Attempts to repair a truncated JSON string by closing any open string,
// then balancing unclosed arrays/objects. Returns null if unrecoverable.
function repairTruncatedJson(input: string): string | null {
  const stack: Array<"{" | "["> = [];
  let inString = false;
  let escape = false;
  let lastCompleteIndex = -1;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (inString) {
      if (escape) {
        escape = false;
      } else if (ch === "\\") {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{" || ch === "[") {
      stack.push(ch);
    } else if (ch === "}" || ch === "]") {
      stack.pop();
      if (stack.length === 0) lastCompleteIndex = i;
    }
  }

  if (stack.length === 0 && !inString) return input;

  let repaired = input;
  // Trim to last comma or opening bracket to drop a partial element
  const trimMatch = repaired.match(/[,{\[]\s*(?:"[^"]*"\s*:\s*)?[^,{}\[\]]*$/);
  if (trimMatch && !inString) {
    const idx = trimMatch.index!;
    repaired = repaired.slice(0, idx + 1).replace(/,\s*$/, "");
  } else if (inString) {
    repaired += '"';
  }

  // Rebuild stack after trim
  const newStack: Array<"{" | "["> = [];
  let s2 = false;
  let e2 = false;
  for (let i = 0; i < repaired.length; i++) {
    const ch = repaired[i];
    if (s2) {
      if (e2) e2 = false;
      else if (ch === "\\") e2 = true;
      else if (ch === '"') s2 = false;
      continue;
    }
    if (ch === '"') { s2 = true; continue; }
    if (ch === "{" || ch === "[") newStack.push(ch);
    else if (ch === "}" || ch === "]") newStack.pop();
  }

  while (newStack.length > 0) {
    const open = newStack.pop();
    repaired += open === "{" ? "}" : "]";
  }

  return repaired;
}

export function parseBusinessConsultantReport(
  modelText: string | null
): { report: BusinessConsultantReport | null; rawText: string } {
  const rawText = (modelText ?? "").trim();
  if (!rawText) {
    return { report: null, rawText };
  }

  const jsonCandidate = extractJsonBlock(rawText) ?? rawText;

  let parsed: any;
  try {
    parsed = JSON.parse(jsonCandidate);
  } catch {
    const repaired = repairTruncatedJson(jsonCandidate);
    if (!repaired) return { report: null, rawText };
    try {
      parsed = JSON.parse(repaired);
    } catch {
      return { report: null, rawText };
    }
  }

  if (!parsed || typeof parsed !== "object") {
    return { report: null, rawText };
  }

  const dataCoverageRaw = parsed.data_coverage ?? {};

  const responseMode: BusinessConsultantResponseMode =
    parsed.response_mode === "answer" ? "answer" : "report";

  const report: BusinessConsultantReport = {
    response_mode: responseMode,
    report_title: coerceString(parsed.report_title, "Business Consultant Report"),
    timestamp: coerceString(parsed.timestamp, new Date().toISOString()),
    data_coverage: {
      inventory_count: coerceNumber(dataCoverageRaw.inventory_count, 0),
      sales_count: coerceNumber(dataCoverageRaw.sales_count, 0),
      missing: toArray<string>(dataCoverageRaw.missing).map((m) => coerceString(m)),
    },
    answer: parsed.answer != null ? coerceString(parsed.answer) : null,
    key_points: toArray<string>(parsed.key_points).map((p) => coerceString(p)),
    kpis: toArray<Record<string, unknown>>(parsed.kpis).map((kpi) => ({
      label: coerceString(kpi.label),
      value: coerceString(kpi.value),
      hint: coerceString(kpi.hint),
    })),
    high_risk_positions: toArray<Record<string, unknown>>(parsed.high_risk_positions).map((pos) => ({
      item: coerceString(pos.item),
      cost_basis: coerceNumber(pos.cost_basis, 0),
      cmv: coerceNumber(pos.cmv, 0),
      delta_pct: coerceNumber(pos.delta_pct, 0),
      reason: coerceString(pos.reason),
    })),
    recommended_actions: toArray<Record<string, unknown>>(parsed.recommended_actions).map((act) => ({
      action: coerceString(act.action),
      impact: coerceString(act.impact),
      effort: (act.effort === "low" || act.effort === "medium" || act.effort === "high"
        ? act.effort
        : "medium") as BusinessConsultantReportEffort,
    })),
    notes: toArray<string>(parsed.notes).map((note) => coerceString(note)),
  };

  return { report, rawText };
}

