import { describe, expect, it } from "vitest";
import {
  isSubmissionAuthError,
  isSubmissionPermissionDenied,
  isSubmissionSchemaMissing,
  toSafeSupabaseErrorMeta,
} from "@/lib/grading/submissions/errors";

describe("grading submissions error helpers", () => {
  it("extracts safe Supabase error metadata", () => {
    expect(
      toSafeSupabaseErrorMeta({
        code: "42501",
        message: "permission denied",
        details: "blocked by policy",
        hint: "check RLS",
      })
    ).toEqual({
      code: "42501",
      message: "permission denied",
      details: "blocked by policy",
      hint: "check RLS",
    });
  });

  it("identifies permission-denied errors", () => {
    expect(isSubmissionPermissionDenied({ code: "42501" })).toBe(true);
    expect(
      isSubmissionPermissionDenied({
        message: "new row violates row-level security policy",
      })
    ).toBe(true);
    expect(isSubmissionPermissionDenied({ code: "42P01" })).toBe(false);
  });

  it("identifies auth token errors", () => {
    expect(isSubmissionAuthError({ code: "PGRST301" })).toBe(true);
    expect(isSubmissionAuthError({ message: "JWT expired" })).toBe(true);
    expect(isSubmissionAuthError({ code: "42501" })).toBe(false);
  });

  it("identifies missing schema errors", () => {
    expect(isSubmissionSchemaMissing({ code: "42P01" })).toBe(true);
    expect(
      isSubmissionSchemaMissing({
        message: 'relation "grading_submissions" does not exist',
      })
    ).toBe(true);
    expect(isSubmissionSchemaMissing({ code: "42501" })).toBe(false);
  });
});
