import { describe, expect, it } from "vitest";
import { parseJsonWithRepair } from "./gradeEstimateParser";

describe("parseJsonWithRepair", () => {
  it("parses mixed text with embedded JSON", () => {
    const text = `Some intro text\n{ "status": "ok", "estimated_grade_low": 8 }\nTrailing note`;
    const parsed = parseJsonWithRepair(text);

    expect(parsed?.value).toBeTruthy();
    expect((parsed?.value as { status?: string }).status).toBe("ok");
  });

  it("repairs common JSON issues", () => {
    const text = '{ “status”: “ok”, "estimated_grade_low": 8, }';
    const parsed = parseJsonWithRepair(text);

    expect(parsed?.value).toBeTruthy();
    expect((parsed?.value as { estimated_grade_low?: number }).estimated_grade_low).toBe(8);
    expect(parsed?.warning).toBeTruthy();
  });
});
