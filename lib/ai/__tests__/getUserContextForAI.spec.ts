import { describe, it, expect, vi, beforeEach } from "vitest";
import { getUserContextForAI } from "../getUserContextForAI";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue({
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [] }),
      single: vi.fn().mockResolvedValue({ data: { id: "user-1", email: "test@example.com", name: "Test User" } }),
    })),
  }),
}));

describe("getUserContextForAI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns sane defaults and caps arrays when there is no data", async () => {
    const ctx = await getUserContextForAI("user-1");

    expect(ctx.user.id).toBe("user-1");
    expect(ctx.collection_summary.total_cards).toBe(0);
    expect(ctx.collection_top.length).toBeLessThanOrEqual(10);
    expect(ctx.collection_recent.length).toBeLessThanOrEqual(10);
    expect(ctx.watchlist_below_target.length).toBeLessThanOrEqual(10);
    expect(ctx.recent_searches.length).toBeLessThanOrEqual(10);
    expect(typeof ctx.app_time).toBe("string");
  });
});

