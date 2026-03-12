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

export interface BusinessConsultantReport {
  report_title: string;
  timestamp: string;
  data_coverage: BusinessConsultantReportDataCoverage;
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
  // Prefer fenced ```json blocks if present
  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch && fencedMatch[1]) {
    return fencedMatch[1].trim();
  }

  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) return null;
  return text.slice(firstBrace, lastBrace + 1);
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
    return { report: null, rawText };
  }

  if (!parsed || typeof parsed !== "object") {
    return { report: null, rawText };
  }

  const dataCoverageRaw = parsed.data_coverage ?? {};

  const report: BusinessConsultantReport = {
    report_title: coerceString(parsed.report_title, "Business Consultant Report"),
    timestamp: coerceString(parsed.timestamp, new Date().toISOString()),
    data_coverage: {
      inventory_count: coerceNumber(dataCoverageRaw.inventory_count, 0),
      sales_count: coerceNumber(dataCoverageRaw.sales_count, 0),
      missing: toArray<string>(dataCoverageRaw.missing).map((m) => coerceString(m)),
    },
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

