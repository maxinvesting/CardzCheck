/**
 * End-to-end Comps → Collection CMV pipeline tests.
 *
 * Simulates every step of the pipeline:
 *   1. Search API returns stats.cmv
 *   2. resolveCmvForSave extracts it
 *   3. Client sends POST with est_cmv + estimated_cmv
 *   4. POST handler coerces and writes cmvPayload
 *   5. isCmvStale determines freshness
 *   6. getEstCmv reads it back for UI
 *   7. computeCollectionSummary aggregates totals
 */
import { describe, it, expect } from "vitest";
import { getEstCmv, computeCollectionSummary, type ValuedCollectionItem } from "../values";
import { isCmvStale } from "../cmv";
import type { CollectionItem, SearchResult, EstimatedSaleRange } from "@/types";

// ─── Helpers that mirror real code exactly ───

/** Mirrors resolveCmvForSave in app/comps/page.tsx */
function resolveCmvForSave(result: SearchResult | null): number | null {
  if (!result) return null;
  const direct = result.stats?.cmv;
  if (typeof direct === "number" && Number.isFinite(direct) && direct > 0) {
    return direct;
  }
  const estimate = result._estimatedSaleRange;
  if (estimate?.pricingAvailable && estimate.estimatedSaleRange) {
    const { low, high } = estimate.estimatedSaleRange;
    const mid = (low + high) / 2;
    if (Number.isFinite(mid) && mid > 0) {
      return Math.round(mid * 100) / 100;
    }
  }
  return null;
}

/** Mirrors coerceCmv in app/api/collection/route.ts POST handler */
function coerceCmv(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? value : null;
  }
  if (typeof value === "string") {
    const cleaned = value.replace(/[$,]/g, "").trim();
    if (!cleaned) return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

/** Simulates POST handler's cmvPayload logic */
function buildCmvPayload(
  estimated_cmv: unknown,
  est_cmv: unknown
): Record<string, unknown> {
  const incomingCmv = coerceCmv(estimated_cmv) ?? coerceCmv(est_cmv);
  return incomingCmv !== null
    ? {
        est_cmv: incomingCmv,
        estimated_cmv: incomingCmv,
        cmv_confidence: "medium",
        cmv_last_updated: new Date().toISOString(),
      }
    : {};
}

/** Creates a mock DB row from an insert payload (simulates Supabase .insert().select()) */
function simulateDbRow(insertPayload: Record<string, unknown>): CollectionItem {
  return {
    id: "test-id",
    user_id: "test-user",
    player_name: (insertPayload.player_name as string) || "Test Player",
    year: (insertPayload.year as string) || null,
    set_name: (insertPayload.set_name as string) || null,
    grade: (insertPayload.grade as string) || null,
    purchase_price: (insertPayload.purchase_price as number) || null,
    purchase_date: null,
    image_url: null,
    notes: null,
    // CMV fields — use payload values if present, else DB defaults
    estimated_cmv:
      "estimated_cmv" in insertPayload
        ? (insertPayload.estimated_cmv as number | null)
        : null,
    cmv_confidence:
      "cmv_confidence" in insertPayload
        ? (insertPayload.cmv_confidence as any)
        : "unavailable",
    cmv_last_updated:
      "cmv_last_updated" in insertPayload
        ? (insertPayload.cmv_last_updated as string | null)
        : null,
    est_cmv:
      "est_cmv" in insertPayload
        ? (insertPayload.est_cmv as number | null)
        : undefined,
    created_at: new Date().toISOString(),
  };
}

/** Creates a minimal SearchResult */
function makeSearchResult(overrides: {
  cmv?: number | null;
  estimatedSaleRange?: EstimatedSaleRange;
} = {}): SearchResult {
  return {
    comps: [],
    stats: {
      cmv: overrides.cmv ?? null,
      avg: 0,
      low: 0,
      high: 0,
      count: 0,
    },
    query: "test query",
    _estimatedSaleRange: overrides.estimatedSaleRange,
  };
}

// ─── TEST RUNS ───

describe("Comps → Collection CMV pipeline", () => {
  describe("TEST RUN 1: handleAddToCollection with stats.cmv = 150", () => {
    // Simulates: User on Comps → clicks "+" on a comp row
    const searchResult = makeSearchResult({ cmv: 150 });

    it("Step 1: resolveCmvForSave extracts CMV from stats.cmv", () => {
      expect(resolveCmvForSave(searchResult)).toBe(150);
    });

    it("Step 2: Client payload has est_cmv + estimated_cmv", () => {
      const cmv = resolveCmvForSave(searchResult);
      const payload = {
        player_name: "Michael Jordan",
        est_cmv: cmv,
        estimated_cmv: cmv,
      };
      expect(payload.est_cmv).toBe(150);
      expect(payload.estimated_cmv).toBe(150);
    });

    it("Step 3: POST handler builds cmvPayload correctly", () => {
      const cmv = resolveCmvForSave(searchResult);
      const cmvPayload = buildCmvPayload(cmv, cmv);
      expect(cmvPayload.estimated_cmv).toBe(150);
      expect(cmvPayload.est_cmv).toBe(150);
      expect(cmvPayload.cmv_confidence).toBe("medium");
      expect(cmvPayload.cmv_last_updated).toBeTruthy();
    });

    it("Step 4: DB row has CMV after insert", () => {
      const cmv = resolveCmvForSave(searchResult);
      const cmvPayload = buildCmvPayload(cmv, cmv);
      const row = simulateDbRow({
        player_name: "Michael Jordan",
        ...cmvPayload,
      });
      expect(row.estimated_cmv).toBe(150);
      expect(row.cmv_confidence).toBe("medium");
      expect(row.cmv_last_updated).toBeTruthy();
    });

    it("Step 5: isCmvStale returns false for freshly inserted row", () => {
      const cmv = resolveCmvForSave(searchResult);
      const cmvPayload = buildCmvPayload(cmv, cmv);
      const row = simulateDbRow({
        player_name: "Michael Jordan",
        ...cmvPayload,
      });
      expect(isCmvStale(row)).toBe(false);
    });

    it("Step 6: getEstCmv returns the CMV from the DB row", () => {
      const cmv = resolveCmvForSave(searchResult);
      const cmvPayload = buildCmvPayload(cmv, cmv);
      const row = simulateDbRow({
        player_name: "Michael Jordan",
        ...cmvPayload,
      });
      expect(getEstCmv(row as ValuedCollectionItem)).toBe(150);
    });

    it("Step 7: computeCollectionSummary includes CMV in totals", () => {
      const cmv = resolveCmvForSave(searchResult);
      const cmvPayload = buildCmvPayload(cmv, cmv);
      const row = simulateDbRow({
        player_name: "Michael Jordan",
        purchase_price: 80,
        ...cmvPayload,
      });
      const summary = computeCollectionSummary([row as ValuedCollectionItem]);
      expect(summary.cardsWithCmv).toBe(1);
      expect(summary.totalDisplayValue).toBe(150);
    });
  });

  describe("TEST RUN 2: handleAddToCollection with stats.cmv as string '142.50'", () => {
    // PostgREST may return numeric as a string
    it("coerceCmv handles string CMV from PostgREST", () => {
      const payload = buildCmvPayload("142.50", null);
      expect(payload.estimated_cmv).toBe(142.5);
      expect(payload.est_cmv).toBe(142.5);
    });

    it("getEstCmv handles string CMV on the returned item", () => {
      const row = simulateDbRow({
        player_name: "Test",
        estimated_cmv: "142.50" as any,
        cmv_confidence: "medium",
        cmv_last_updated: new Date().toISOString(),
      });
      // getEstCmv uses coercePositiveNumber which handles strings
      expect(getEstCmv(row as ValuedCollectionItem)).toBe(142.5);
    });
  });

  describe("TEST RUN 3: ConfirmAddCardModal path WITHOUT initialCmv (pre-fix)", () => {
    // Before our fix, ConfirmAddCardModal sent no CMV
    it("no CMV in payload → empty cmvPayload → DB defaults", () => {
      const payload = buildCmvPayload(undefined, undefined);
      expect(Object.keys(payload).length).toBe(0);
    });

    it("row without CMV → isCmvStale returns true", () => {
      const row = simulateDbRow({ player_name: "Test" });
      // cmv_confidence defaults to 'unavailable', cmv_last_updated to null
      expect(row.cmv_confidence).toBe("unavailable");
      expect(row.cmv_last_updated).toBeNull();
      expect(isCmvStale(row)).toBe(true);
    });

    it("row without CMV → getEstCmv returns null → UI shows 'CMV unavailable'", () => {
      const row = simulateDbRow({ player_name: "Test" });
      expect(getEstCmv(row as ValuedCollectionItem)).toBeNull();
    });
  });

  describe("TEST RUN 4: ConfirmAddCardModal path WITH initialCmv (post-fix)", () => {
    const searchResult = makeSearchResult({ cmv: 200 });
    const initialCmv = resolveCmvForSave(searchResult);

    it("initialCmv is extracted correctly", () => {
      expect(initialCmv).toBe(200);
    });

    it("ConfirmAddCardModal body includes CMV when initialCmv is valid", () => {
      // Simulates the fix in ConfirmAddCardModal.handleConfirm
      const cmvValue =
        typeof initialCmv === "number" &&
        Number.isFinite(initialCmv) &&
        initialCmv > 0
          ? initialCmv
          : null;

      const body = {
        player_name: "Test Player",
        ...(cmvValue !== null
          ? { est_cmv: cmvValue, estimated_cmv: cmvValue }
          : {}),
      };

      expect(body.est_cmv).toBe(200);
      expect(body.estimated_cmv).toBe(200);
    });

    it("POST handler correctly persists the CMV", () => {
      const payload = buildCmvPayload(initialCmv, initialCmv);
      expect(payload.estimated_cmv).toBe(200);
      expect(payload.cmv_confidence).toBe("medium");
    });

    it("full pipeline: ConfirmAddCardModal → DB → getEstCmv → UI", () => {
      const payload = buildCmvPayload(initialCmv, initialCmv);
      const row = simulateDbRow({
        player_name: "Test Player",
        ...payload,
      });
      expect(isCmvStale(row)).toBe(false);
      expect(getEstCmv(row as ValuedCollectionItem)).toBe(200);

      const summary = computeCollectionSummary([row as ValuedCollectionItem]);
      expect(summary.cardsWithCmv).toBe(1);
      expect(summary.totalDisplayValue).toBe(200);
    });
  });

  describe("TEST RUN 5: resolveCmvForSave edge cases", () => {
    it("returns null when results is null", () => {
      expect(resolveCmvForSave(null)).toBeNull();
    });

    it("returns null when stats.cmv is 0", () => {
      const result = makeSearchResult({ cmv: 0 });
      expect(resolveCmvForSave(result)).toBeNull();
    });

    it("returns null when stats.cmv is negative", () => {
      const result = makeSearchResult({ cmv: -10 });
      expect(resolveCmvForSave(result)).toBeNull();
    });

    it("falls through to _estimatedSaleRange when stats.cmv is null", () => {
      const result = makeSearchResult({
        cmv: null,
        estimatedSaleRange: {
          pricingAvailable: true,
          marketAsk: { count: 5, medianAsk: 100, p20: 80, p80: 120 },
          estimatedSaleRange: {
            low: 80,
            high: 120,
            discountApplied: 0.1,
            confidence: "medium",
            spreadPct: 0.4,
          },
        },
      });
      // Midpoint of 80-120 = 100
      expect(resolveCmvForSave(result)).toBe(100);
    });

    it("prefers stats.cmv over _estimatedSaleRange when both exist", () => {
      const result = makeSearchResult({
        cmv: 150,
        estimatedSaleRange: {
          pricingAvailable: true,
          marketAsk: { count: 5, medianAsk: 200, p20: 180, p80: 220 },
          estimatedSaleRange: {
            low: 180,
            high: 220,
            discountApplied: 0.1,
            confidence: "medium",
            spreadPct: 0.2,
          },
        },
      });
      expect(resolveCmvForSave(result)).toBe(150);
    });
  });

  describe("TEST RUN 6: isCmvStale edge cases for freshly added cards", () => {
    it("stale when cmv_last_updated is null", () => {
      const row: CollectionItem = {
        id: "1",
        user_id: "u1",
        player_name: "Test",
        year: null,
        set_name: null,
        grade: null,
        purchase_price: null,
        purchase_date: null,
        image_url: null,
        notes: null,
        estimated_cmv: 100,
        cmv_confidence: "medium",
        cmv_last_updated: null,
        created_at: new Date().toISOString(),
      };
      expect(isCmvStale(row)).toBe(true);
    });

    it("stale when cmv_confidence is unavailable", () => {
      const row: CollectionItem = {
        id: "1",
        user_id: "u1",
        player_name: "Test",
        year: null,
        set_name: null,
        grade: null,
        purchase_price: null,
        purchase_date: null,
        image_url: null,
        notes: null,
        estimated_cmv: 100,
        cmv_confidence: "unavailable",
        cmv_last_updated: new Date().toISOString(),
        created_at: new Date().toISOString(),
      };
      expect(isCmvStale(row)).toBe(true);
    });

    it("NOT stale when confidence=medium and updated recently", () => {
      const row: CollectionItem = {
        id: "1",
        user_id: "u1",
        player_name: "Test",
        year: null,
        set_name: null,
        grade: null,
        purchase_price: null,
        purchase_date: null,
        image_url: null,
        notes: null,
        estimated_cmv: 100,
        cmv_confidence: "medium",
        cmv_last_updated: new Date().toISOString(),
        created_at: new Date().toISOString(),
      };
      expect(isCmvStale(row)).toBe(false);
    });
  });

  describe("TEST RUN 7: Multiple cards aggregation", () => {
    it("sums CMV across multiple cards, skips null", () => {
      const card1 = simulateDbRow({
        player_name: "Card 1",
        ...buildCmvPayload(150, 150),
      });
      const card2 = simulateDbRow({
        player_name: "Card 2",
        // No CMV
      });
      const card3 = simulateDbRow({
        player_name: "Card 3",
        ...buildCmvPayload(200, 200),
      });

      const items = [card1, card2, card3] as ValuedCollectionItem[];
      const summary = computeCollectionSummary(items);

      expect(summary.cardCount).toBe(3);
      expect(summary.cardsWithCmv).toBe(2);
      expect(summary.totalDisplayValue).toBe(350);
    });
  });

  describe("TEST RUN 8: Comps stats.cmv matches Collection getEstCmv", () => {
    // The core invariant: the CMV shown on Comps must equal what Collection shows
    const cmvValues = [0.50, 1, 10.99, 100, 1234.56, 99999.99];

    for (const val of cmvValues) {
      it(`stats.cmv=${val} → Collection shows ${val}`, () => {
        const result = makeSearchResult({ cmv: val });
        const resolved = resolveCmvForSave(result);
        expect(resolved).toBe(val);

        const payload = buildCmvPayload(resolved, resolved);
        const row = simulateDbRow({
          player_name: "Test",
          ...payload,
        });
        expect(getEstCmv(row as ValuedCollectionItem)).toBe(val);
      });
    }
  });
});
