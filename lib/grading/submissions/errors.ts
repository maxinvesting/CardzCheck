export function getErrorMessage(error: unknown): string {
  if (!error || typeof error !== "object") return "";
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" ? message : "";
}

export function getErrorCode(error: unknown): string {
  if (!error || typeof error !== "object") return "";
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : "";
}

export function isSubmissionSchemaMissing(error: unknown): boolean {
  const code = getErrorCode(error);
  if (code === "42P01" || code === "42704") {
    return true;
  }

  const lower = getErrorMessage(error).toLowerCase();
  if (!lower) return false;

  const referencesSubmissionSchema =
    lower.includes("grading_submissions") ||
    lower.includes("grading_submission_items") ||
    lower.includes("grading_submission_mode") ||
    lower.includes("grading_submission_grader") ||
    lower.includes("grading_submission_status") ||
    lower.includes("grading_submission_source_type");

  const missingLanguage =
    lower.includes("does not exist") ||
    lower.includes("undefined table") ||
    lower.includes("undefined object") ||
    lower.includes("relation") ||
    lower.includes("type");

  return referencesSubmissionSchema && missingLanguage;
}

export function buildFeatureUnavailableMessage(): string {
  return "Submission Builder setup is incomplete. Apply the grading submissions migration and refresh.";
}
