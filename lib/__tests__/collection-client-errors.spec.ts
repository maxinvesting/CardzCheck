import { describe, expect, it } from "vitest";
import { getCollectionErrorMessage } from "@/lib/collection/client-errors";

describe("getCollectionErrorMessage", () => {
  it("returns server error when provided", () => {
    expect(
      getCollectionErrorMessage(
        { error: "card_number must be an integer" },
        "Failed to add card"
      )
    ).toBe("card_number must be an integer");
  });

  it("falls back to message when error is missing", () => {
    expect(
      getCollectionErrorMessage(
        { message: "Validation failed" },
        "Failed to add card"
      )
    ).toBe("Validation failed");
  });

  it("uses fallback for unknown payloads", () => {
    expect(getCollectionErrorMessage(null, "Failed to add card")).toBe(
      "Failed to add card"
    );
  });
});
