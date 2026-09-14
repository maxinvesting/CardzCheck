/**
 * Shared grade parsing for the inventory add flows (single + bulk).
 *
 * A card's grade is entered as free text ("PSA 10", "BGS 9.5", "10", "RAW", or
 * blank). These helpers normalize that into the structured fields the DB stores
 * — condition (raw/graded), grading company, and the numeric grade — so the
 * single-card modal and the bulk grid interpret the same input identically.
 */

const GRADER_GRADE_PATTERN = /^(PSA|BGS|SGC|CGC)\s*(\d+(?:\.\d+)?)$/i;
const WHOLE_GRADE_PATTERN = /^\d+(?:\.0)?$/;
const HALF_GRADE_PATTERN = /^\d+\.5$/;

export interface GradeInput {
  grader?: string | null;
  grade?: string | null;
}

export interface ResolvedGrade {
  conditionStatus: "raw" | "graded";
  gradingCompany: string | null;
  gradeValue: string | null;
  gradeLabel: string | null;
}

function inferGradingCompany(gradeValue: string): string | null {
  if (HALF_GRADE_PATTERN.test(gradeValue)) return "BGS";
  if (WHOLE_GRADE_PATTERN.test(gradeValue)) return "PSA";
  return null;
}

export function resolveGradeFields(input: GradeInput): ResolvedGrade {
  const rawGrader = input.grader?.trim() || "";
  const rawGrade = input.grade?.trim() || "";
  const graderUpper = rawGrader ? rawGrader.toUpperCase() : "";

  if (graderUpper === "RAW" || rawGrade.toLowerCase() === "raw") {
    return {
      conditionStatus: "raw",
      gradingCompany: null,
      gradeValue: null,
      gradeLabel: null,
    };
  }

  const parsed = rawGrade.match(GRADER_GRADE_PATTERN);
  const parsedGrader = parsed?.[1]?.toUpperCase();
  const parsedGradeValue = parsed?.[2];
  const normalizedGradeValue = parsedGradeValue || rawGrade || "";

  const gradingCompany =
    graderUpper && graderUpper !== "RAW"
      ? graderUpper
      : parsedGrader || inferGradingCompany(normalizedGradeValue) || null;
  const gradeValue = normalizedGradeValue || null;

  if (!gradingCompany && !gradeValue) {
    return {
      conditionStatus: "raw",
      gradingCompany: null,
      gradeValue: null,
      gradeLabel: null,
    };
  }

  const gradeLabel = [gradingCompany, gradeValue].filter(Boolean).join(" ").trim();

  return {
    conditionStatus: "graded",
    gradingCompany,
    gradeValue,
    gradeLabel: gradeLabel || null,
  };
}

/** Build a display title from a card's identity fields + resolved grade. */
export function buildInventoryTitle(card: {
  year?: string | null;
  player_name?: string | null;
  set_name?: string | null;
  parallel_type?: string | null;
  grader?: string | null;
  grade?: string | null;
}): string {
  const grade = resolveGradeFields(card);
  return (
    [card.year, card.player_name, card.set_name, card.parallel_type, grade.gradeLabel]
      .filter(Boolean)
      .join(" ")
      .trim() || (card.player_name ?? "")
  );
}
