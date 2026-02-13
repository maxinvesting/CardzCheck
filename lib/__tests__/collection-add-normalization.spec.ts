import { describe, expect, it } from "vitest";
import {
  buildCollectionInsertPayload,
  extractMissingColumnFromPostgrestMessage,
  normalizeCollectionAddInput,
  validateCollectionAddInput,
} from "@/lib/collection/add-normalization";

describe("collection add normalization", () => {
  it("allows missing optional fields without failing validation", () => {
    const normalized = normalizeCollectionAddInput({
      player_name: "CJ Stroud",
      year: "2023",
      set_name: "Prizm",
      grade: "Raw",
    });

    expect(validateCollectionAddInput(normalized)).toBeNull();

    const payload = buildCollectionInsertPayload(
      "user-1",
      normalized,
      "2026-02-08T00:00:00.000Z"
    );

    expect(payload.parallel_type).toBeNull();
    expect(payload.card_number).toBeNull();
    expect(payload.image_url).toBeNull();
    expect(payload.cmv_status).toBe("pending");
    expect(payload.player_name).toBe("CJ Stroud");
  });

  it("normalizes camelCase aliases into snake_case fields", () => {
    const normalized = normalizeCollectionAddInput({
      playerName: "Michael Jordan",
      setName: "Fleer",
      parallelType: " Silver Prizm ",
      cardNumber: " 123 ",
      imageUrl: " https://example.com/card.jpg ",
      estimatedCmv: "150.00",
    });

    expect(normalized.player_name).toBe("Michael Jordan");
    expect(normalized.set_name).toBe("Fleer");
    expect(normalized.parallel_type).toBe("Silver Prizm");
    expect(normalized.card_number).toBe(123);
    expect(normalized.image_url).toBe("https://example.com/card.jpg");
    expect(normalized.estimated_cmv).toBe(150);

    const payload = buildCollectionInsertPayload(
      "user-1",
      normalized,
      "2026-02-08T00:00:00.000Z"
    );
    expect(payload.thumbnail_url).toBe("https://example.com/card.jpg");
    expect(payload.cmv_status).toBe("ready");
    expect(payload.cmv_value).toBe(150);
  });

  it("coerces non-integer card_number values to null", () => {
    const normalized = normalizeCollectionAddInput({
      player_name: "Shohei Ohtani",
      card_number: "ABC-12",
    });

    expect(normalized.card_number).toBeNull();
  });

  it("drops non-http image URLs to avoid oversized collection responses", () => {
    const normalized = normalizeCollectionAddInput({
      player_name: "Sam Darnold",
      image_url: "data:image/jpeg;base64,abc",
      image_urls: [
        "data:image/jpeg;base64,def",
        "http://example.com/front.jpg",
        "https://example.com/front.jpg",
        "   ",
      ],
    });

    expect(normalized.image_url).toBeNull();
    expect(normalized.image_urls).toEqual(["https://example.com/front.jpg"]);

    const payload = buildCollectionInsertPayload(
      "user-1",
      normalized,
      "2026-02-08T00:00:00.000Z"
    );
    expect(payload.image_url).toBeNull();
    expect(payload.thumbnail_url).toBe("https://example.com/front.jpg");
  });

  it("extracts missing column from postgrest error message", () => {
    const missing = extractMissingColumnFromPostgrestMessage(
      "Could not find the 'card_number' column of 'collection_items' in the schema cache"
    );
    expect(missing).toBe("card_number");
  });
});
