import type { BusinessInventoryItem } from "@/types";
import { buildEbaySoldUrl } from "@/lib/ebay/comps-url";

export const USD_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
});

export const GRADER_GRADE_PATTERN = /^(PSA|BGS|SGC|CGC)\s*(\d+(?:\.\d+)?)$/i;
export const GRADER_PATTERN = /\b(PSA|BGS|SGC|CGC)\b/i;
export const WHOLE_GRADE_PATTERN = /^\d+(?:\.0)?$/;
export const HALF_GRADE_PATTERN = /^\d+\.5$/;

export function fmtCents(cents: number | null | undefined): string {
  if (cents == null) return "";
  return USD_FORMATTER.format(cents / 100);
}

export function getDaysHeld(acquisitionDate: string | null | undefined): number | null {
  if (!acquisitionDate) return null;
  const acq = new Date(acquisitionDate);
  if (isNaN(acq.getTime())) return null;
  const now = new Date();
  return Math.floor((now.getTime() - acq.getTime()) / (1000 * 60 * 60 * 24));
}

export function getDaysHeldColor(days: number | null): string {
  if (days === null) return "text-[var(--biz-muted)]";
  if (days < 30) return "text-emerald-700";
  if (days <= 60) return "text-amber-700";
  return "text-red-600";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function inferGradingCompany(gradeValue: string): string | null {
  if (HALF_GRADE_PATTERN.test(gradeValue)) return "BGS";
  if (WHOLE_GRADE_PATTERN.test(gradeValue)) return "PSA";
  return null;
}

export function buildDisplayTitle(item: BusinessInventoryItem): string {
  const baseTitle = (item.title || "").trim();
  if (!baseTitle) return baseTitle;

  const rawGrade = item.grade?.trim() || "";
  const rawGrader = item.grading_company?.trim() || "";
  if (!rawGrade && !rawGrader) return baseTitle;
  if (item.condition_status === "raw" || rawGrade.toLowerCase() === "raw") return baseTitle;

  const parsed = rawGrade.match(GRADER_GRADE_PATTERN);
  const parsedGrader = parsed?.[1]?.toUpperCase();
  const parsedGrade = parsed?.[2];
  const gradeValue = parsedGrade || rawGrade;
  const grader = rawGrader
    ? rawGrader.toUpperCase()
    : parsedGrader || inferGradingCompany(gradeValue);
  const gradeLabel = [grader, gradeValue].filter(Boolean).join(" ").trim();
  if (!gradeLabel) return baseTitle;

  if (new RegExp(`\\b${escapeRegExp(gradeLabel)}\\b`, "i").test(baseTitle)) {
    return baseTitle;
  }

  if (gradeValue && grader && !GRADER_PATTERN.test(baseTitle)) {
    const trailingGradePattern = new RegExp(`\\b${escapeRegExp(gradeValue)}\\s*$`, "i");
    if (trailingGradePattern.test(baseTitle)) {
      return baseTitle.replace(trailingGradePattern, gradeLabel);
    }
  }

  return `${baseTitle} ${gradeLabel}`.replace(/\s+/g, " ").trim();
}

export function statusColor(status: string): string {
  switch (status) {
    case "sold": return "border border-emerald-200 bg-emerald-50 text-emerald-700";
    case "listed": return "border border-blue-200 bg-blue-50 text-blue-700";
    case "pending_sale": return "border border-amber-200 bg-amber-50 text-amber-700";
    case "returned": return "border border-red-200 bg-red-50 text-red-700";
    default: return "border border-[var(--biz-border)] bg-[#F9FAFB] text-[var(--biz-muted)]";
  }
}

export function statusLabel(status: string): string {
  switch (status) {
    case "pending_sale": return "Pending";
    default: return status.charAt(0).toUpperCase() + status.slice(1);
  }
}

export function gradeBadgeLabel(item: BusinessInventoryItem): string | null {
  if (item.condition_status === "graded") {
    const grader = item.grading_company?.toUpperCase() || "";
    const grade = item.grade || "";
    if (grader && grade) return `${grader} ${grade}`;
    if (grade) return grade;
    return "Graded";
  }
  if (item.condition_status === "raw") return "Raw";
  return null;
}

export function gradeBadgeColor(item: BusinessInventoryItem): string {
  if (item.condition_status !== "graded") {
    return "bg-[#F3F4F6] text-[var(--biz-muted)]";
  }
  const grade = parseFloat(item.grade || "0");
  if (grade >= 10) return "bg-blue-600 text-white";
  if (grade >= 9) return "bg-emerald-600 text-white";
  if (grade >= 8) return "bg-emerald-100 text-emerald-800";
  if (grade >= 7) return "bg-amber-100 text-amber-800";
  return "bg-[#F3F4F6] text-[var(--biz-muted)]";
}

export function getCompsUrl(item: BusinessInventoryItem): string {
  return buildEbaySoldUrl({
    title: item.title,
    grade: item.grade,
    gradingCompany: item.grading_company,
  });
}

export function isUnderwater(item: BusinessInventoryItem): boolean {
  const cost = item.cost_basis_total_cents;
  const cmv = item.current_market_value_cents;
  if (!cost || !cmv || cmv <= 0) return false;
  return cmv < cost;
}
