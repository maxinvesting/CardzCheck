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

export function getErrorDetails(error: unknown): string {
  if (!error || typeof error !== "object") return "";
  const details = (error as { details?: unknown }).details;
  return typeof details === "string" ? details : "";
}

export function getErrorHint(error: unknown): string {
  if (!error || typeof error !== "object") return "";
  const hint = (error as { hint?: unknown }).hint;
  return typeof hint === "string" ? hint : "";
}

export function toSafeSupabaseErrorMeta(error: unknown): {
  code: string;
  message: string;
  details: string;
  hint: string;
} {
  return {
    code: getErrorCode(error),
    message: getErrorMessage(error),
    details: getErrorDetails(error),
    hint: getErrorHint(error),
  };
}

export function isSubmissionPermissionDenied(error: unknown): boolean {
  const code = getErrorCode(error);
  if (code === "42501") {
    return true;
  }

  const lower = getErrorMessage(error).toLowerCase();
  return (
    lower.includes("permission denied") ||
    lower.includes("row-level security") ||
    lower.includes("not authorized")
  );
}

export function isSubmissionAuthError(error: unknown): boolean {
  const code = getErrorCode(error);
  if (code === "PGRST301" || code === "PGRST303") {
    return true;
  }

  const lower = getErrorMessage(error).toLowerCase();
  return (
    lower.includes("jwt") ||
    lower.includes("token") ||
    lower.includes("auth session missing")
  );
}

export function isSubmissionSchemaMissing(error: unknown): boolean {
  const code = getErrorCode(error);
  if (code === "42P01" || code === "42704" || code === "42703") {
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
    lower.includes("undefined column") ||
    lower.includes("undefined object") ||
    lower.includes("relation") ||
    lower.includes("column") ||
    lower.includes("type");

  return referencesSubmissionSchema && missingLanguage;
}

export function buildFeatureUnavailableMessage(): string {
  return "Submission Builder setup is incomplete. Apply the grading submissions migration and refresh.";
}
