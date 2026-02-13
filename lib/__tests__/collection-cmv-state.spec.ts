import { describe, expect, it } from "vitest";
import {
  getCollectionCmvUiState,
  isNewCardCmvPending,
} from "@/lib/collection/cmv-state";

describe("isNewCardCmvPending", () => {
  const nowMs = new Date("2026-02-08T20:30:00.000Z").getTime();

  it("returns true for newly added cards with null CMV", () => {
    expect(
      isNewCardCmvPending(
        {
          created_at: "2026-02-08T20:29:30.000Z",
          estimated_cmv: null,
          est_cmv: null,
        },
        nowMs
      )
    ).toBe(true);
  });

  it("returns false when card is older than 120 seconds", () => {
    expect(
      isNewCardCmvPending(
        {
          created_at: "2026-02-08T20:27:00.000Z",
          estimated_cmv: null,
          est_cmv: null,
        },
        nowMs
      )
    ).toBe(false);
  });

  it("returns false when CMV is present", () => {
    expect(
      isNewCardCmvPending(
        {
          created_at: "2026-02-08T20:29:30.000Z",
          estimated_cmv: 120,
        },
        nowMs
      )
    ).toBe(false);
  });

  it("marks long-running pending CMV as pending_stale after 15 seconds", () => {
    expect(
      getCollectionCmvUiState(
        {
          cmv_status: "pending",
          cmv_updated_at: "2026-02-08T20:29:40.000Z",
          estimated_cmv: null,
          est_cmv: null,
        },
        nowMs
      )
    ).toBe("pending_stale");
  });

  it("marks failed CMV explicitly", () => {
    expect(
      getCollectionCmvUiState(
        {
          cmv_status: "failed",
          estimated_cmv: null,
          est_cmv: null,
        },
        nowMs
      )
    ).toBe("failed");
  });
});
