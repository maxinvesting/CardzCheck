/**
 * Validates the confirm-add-card payload logic used by ConfirmAddCardModal.
 *
 * The modal should allow adding a card when player_name is present,
 * even if optional fields like card_number, parallel_type, or imageUrl are missing.
 */
import { describe, it, expect } from "vitest";
import type { CardIdentificationResult } from "@/types";

// ─── Mirror the validation + payload logic from ConfirmAddCardModal ───

/**
 * Determines whether the modal should enter editable-confirmation mode.
 * Mirrors `needsConfirmation` in ConfirmAddCardModal.
 */
function needsConfirmation(card: CardIdentificationResult | null): boolean {
  return (
    card?.confidence === "low" ||
    (card?.players != null && card.players.length > 1) ||
    card?.insert === "Downtown" ||
    !card?.player_name
  );
}

interface ConfirmPayload {
  player_name: string;
  year: string | null;
  set_name: string | null;
  parallel_type: string | null;
  card_number: string | null;
  grade: string;
  image_url: string | null;
}

/**
 * Validates & builds the payload that ConfirmAddCardModal sends to POST /api/collection.
 * Returns null when validation fails.
 */
function buildConfirmPayload(
  cardData: CardIdentificationResult | null,
  editablePlayerName: string,
  editableYear: string,
  editableSet: string,
  condition: string,
): ConfirmPayload | null {
  if (!cardData) return null;

  const isEditable = needsConfirmation(cardData);
  const resolvedPlayerName = isEditable
    ? editablePlayerName || cardData.player_name
    : cardData.player_name;

  if (!resolvedPlayerName?.trim()) return null;

  const finalYear = isEditable ? editableYear : cardData.year;
  const finalSet = isEditable ? editableSet : cardData.set_name;

  return {
    player_name: resolvedPlayerName,
    year: finalYear || null,
    set_name: finalSet || null,
    parallel_type: cardData.parallel_type || null,
    card_number: cardData.card_number || null,
    grade: condition,
    image_url: cardData.imageUrl || null,
  };
}

// ─── Helpers ───

function makeCard(overrides: Partial<CardIdentificationResult> = {}): CardIdentificationResult {
  return {
    player_name: "CJ Stroud",
    year: "2023",
    set_name: "Topps Chrome",
    imageUrl: "",
    confidence: "high",
    ...overrides,
  };
}

// ─── Tests ───

describe("ConfirmAddCardModal payload validation", () => {
  it("allows add when all fields present", () => {
    const card = makeCard({
      parallel_type: "Purple Refractor",
      card_number: "123",
    });
    const payload = buildConfirmPayload(card, "", "", "", "PSA 9");
    expect(payload).not.toBeNull();
    expect(payload!.player_name).toBe("CJ Stroud");
    expect(payload!.parallel_type).toBe("Purple Refractor");
    expect(payload!.card_number).toBe("123");
  });

  it("allows add when card_number is missing (optional)", () => {
    const card = makeCard({ card_number: undefined });
    const payload = buildConfirmPayload(card, "", "", "", "Raw");
    expect(payload).not.toBeNull();
    expect(payload!.player_name).toBe("CJ Stroud");
    expect(payload!.card_number).toBeNull();
  });

  it("allows add when parallel_type is missing (optional)", () => {
    const card = makeCard({ parallel_type: undefined });
    const payload = buildConfirmPayload(card, "", "", "", "Raw");
    expect(payload).not.toBeNull();
    expect(payload!.parallel_type).toBeNull();
  });

  it("allows add when imageUrl is empty (optional)", () => {
    const card = makeCard({ imageUrl: "" });
    const payload = buildConfirmPayload(card, "", "", "", "Raw");
    expect(payload).not.toBeNull();
    expect(payload!.image_url).toBeNull();
  });

  it("enters confirmation mode when player_name is missing, accepts edited name", () => {
    const card = makeCard({ player_name: "" });
    expect(needsConfirmation(card)).toBe(true);
    // User edits the player name in the editable field
    const payload = buildConfirmPayload(card, "CJ Stroud", "2023", "Topps Chrome", "PSA 9");
    expect(payload).not.toBeNull();
    expect(payload!.player_name).toBe("CJ Stroud");
  });

  it("rejects when both player_name and editable name are empty", () => {
    const card = makeCard({ player_name: "" });
    const payload = buildConfirmPayload(card, "", "2023", "Topps Chrome", "PSA 9");
    expect(payload).toBeNull();
  });

  it("returns null when cardData is null", () => {
    const payload = buildConfirmPayload(null, "", "", "", "Raw");
    expect(payload).toBeNull();
  });

  it("only requires player_name — year and set can be empty", () => {
    const card = makeCard({ year: undefined, set_name: undefined });
    const payload = buildConfirmPayload(card, "", "", "", "Raw");
    expect(payload).not.toBeNull();
    expect(payload!.player_name).toBe("CJ Stroud");
    expect(payload!.year).toBeNull();
    expect(payload!.set_name).toBeNull();
  });

  it("needsConfirmation is true for low-confidence cards", () => {
    const card = makeCard({ confidence: "low" });
    expect(needsConfirmation(card)).toBe(true);
  });

  it("needsConfirmation is false for high-confidence card with player_name", () => {
    const card = makeCard();
    expect(needsConfirmation(card)).toBe(false);
  });
});
