import { describe, expect, it } from "vitest";
import { buildSubmissionListRows } from "@/lib/grading/submissions/list";

describe("buildSubmissionListRows", () => {
  it("returns an empty array for empty submissions", () => {
    expect(buildSubmissionListRows([], [])).toEqual([]);
    expect(buildSubmissionListRows(null, null)).toEqual([]);
  });
});
