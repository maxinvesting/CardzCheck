import { describe, it, expect, vi } from "vitest";
import type { CollectionItem } from "@/types";
import { buildCardKey, runCmvWiringCheck } from "@/lib/dev/cmv-wiring";

const makeItem = (overrides: Partial<CollectionItem> = {}): CollectionItem => ({
  id: "card-1",
  user_id: "user-1",
  player_name: "Test Player",
  year: "2020",
  set_name: "Test Set",
  grade: "PSA 10",
  purchase_price: 100,
  purchase_date: null,
  image_url: null,
  notes: null,
  estimated_cmv: 150,
  cmv_confidence: "medium",
  cmv_last_updated: "2026-02-05T00:00:00.000Z",
  created_at: "2026-02-05T00:00:00.000Z",
  ...overrides,
});

describe("cmv wiring harness", () => {
  it("wires comps -> persist -> collection/dashboard", async () => {
    const cardId = "card-1";
    const cardKey = buildCardKey({
      player_name: "Test Player",
      year: "2020",
      set_name: "Test Set",
      grade: "PSA 10",
    });

    const storedItem = makeItem({
      id: cardId,
      estimated_cmv: 150,
      est_cmv: 150,
    });

    const deps = {
      fetchComps: vi.fn().mockResolvedValue({
        compsCount: 5,
        cmvMid: 150,
      }),
      persistCmv: vi.fn().mockResolvedValue(storedItem),
      fetchCollectionItems: vi.fn().mockResolvedValue([storedItem]),
      fetchDashboardItems: vi.fn().mockResolvedValue([storedItem]),
      now: () => "2026-02-05T00:00:00.000Z",
    };

    const report = await runCmvWiringCheck({
      cardId,
      cardKey,
      deps,
    });

    expect(report.checks.compsFetched).toBe(true);
    expect(report.checks.cmvComputed).toBe(true);
    expect(report.checks.cmvPersisted).toBe(true);
    expect(report.checks.collectionReturnsCmv).toBe(true);
    expect(report.checks.dashboardTotalsMatchCollection).toBe(true);
    expect(report.checks.nullToZeroBugPresent).toBe(false);
  });
});
