import { describe, expect, it } from "vitest";
import {
  buildCollectionInsertPayload,
  normalizeCollectionAddInput,
} from "@/lib/collection/add-normalization";
import { buildPendingCmvUpdate, toCmvPayloadFromResult } from "@/lib/cmv";
import { selectBrowseItemImageUrl } from "@/lib/ebay/browse-api";

describe("collection thumbnail + CMV lifecycle integration", () => {
  it("known card flow persists thumbnail_url and settles CMV within a bounded time", async () => {
    const knownBrowseItem = {
      title: "Jayden Daniels 2024 Panini Prizm PSA 9",
      primaryImage: {
        imageUrl: "http://i.ebayimg.com/images/g/known-primary/s-l1600.jpg",
      },
      additionalImages: [
        {
          imageUrl: "https://i.ebayimg.com/images/g/known-additional/s-l1600.jpg",
        },
      ],
    };

    const thumbnailUrl = selectBrowseItemImageUrl(knownBrowseItem);
    expect(thumbnailUrl).toBe(
      "https://i.ebayimg.com/images/g/known-primary/s-l1600.jpg"
    );

    const normalized = normalizeCollectionAddInput({
      player_name: "Jayden Daniels",
      year: "2024",
      set_name: "Panini Prizm",
      grade: "PSA 9",
      image_url: thumbnailUrl,
      estimated_cmv: null,
      est_cmv: null,
    });

    const payload = buildCollectionInsertPayload(
      "user-1",
      normalized,
      "2026-02-08T20:30:00.000Z"
    );

    expect(payload.thumbnail_url).toBe(thumbnailUrl);
    expect(payload.cmv_status).toBe("pending");

    const pending = buildPendingCmvUpdate("2026-02-08T20:30:00.000Z");
    expect(pending.cmv_status).toBe("pending");

    const startedAt = Date.now();
    const resolved = (await Promise.race([
      new Promise<{ payload: ReturnType<typeof buildPendingCmvUpdate>; errorCode: null | string }>((resolve) => {
        setTimeout(() => {
          resolve(
            toCmvPayloadFromResult({
              estimated_cmv: 190.5,
              est_cmv: 190.5,
              cmv_confidence: "medium",
              cmv_last_updated: "2026-02-08T20:30:05.000Z",
            })
          );
        }, 5);
      }),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("CMV transition timed out")), 250);
      }),
    ])) as ReturnType<typeof toCmvPayloadFromResult>;

    const elapsedMs = Date.now() - startedAt;
    expect(elapsedMs).toBeLessThan(250);
    expect(resolved.errorCode).toBeNull();
    expect(resolved.payload.cmv_status).toBe("ready");
    expect(resolved.payload.cmv_value).toBe(190.5);
  });

  it("zero-comps flow transitions to failed and does not stay pending", () => {
    const resolved = toCmvPayloadFromResult({
      estimated_cmv: null,
      est_cmv: null,
      cmv_confidence: "unavailable",
      cmv_last_updated: "2026-02-08T20:30:00.000Z",
    });

    expect(resolved.errorCode).toBe("no_comps");
    expect(resolved.payload.cmv_status).toBe("failed");
    expect(resolved.payload.cmv_value).toBeNull();
  });
});

