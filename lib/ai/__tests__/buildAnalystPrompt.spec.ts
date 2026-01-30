import { describe, it, expect } from "vitest";
import { buildAnalystPrompt } from "../buildAnalystPrompt";
import type { UserAIContext } from "../getUserContextForAI";

const baseContext: UserAIContext = {
  user: { id: "u1", name: "Test", email: "t@example.com" },
  collection_summary: {
    total_cards: 0,
    total_value: 0,
    cost_basis: 0,
    unrealized_pl: 0,
    change_30d: null,
  },
  collection_top: [],
  collection_recent: [],
  watchlist_summary: {
    total_cards: 0,
    total_value_if_purchased: 0,
    below_target_count: 0,
  },
  watchlist_below_target: [],
  recent_searches: [],
  app_time: new Date().toISOString(),
};

describe("buildAnalystPrompt", () => {
  it("embeds UserAIContext JSON in the system prompt", () => {
    const { system } = buildAnalystPrompt({
      userMessage: "What is my most valuable card?",
      userName: "Test",
      userContext: baseContext,
    });

    expect(system).toContain("USER CONTEXT (SOURCE OF TRUTH - JSON):");
    expect(system).toContain('"total_cards": 0');
  });

  it("includes hard rules about empty collection behavior", () => {
    const { system } = buildAnalystPrompt({
      userMessage: "What is my most valuable card?",
      userName: "Test",
      userContext: baseContext,
    });

    expect(system).toContain("If the user's collection is empty");
    expect(system.toLowerCase()).toContain(
      "never invent or guess cards the user owns or watches".toLowerCase()
    );
  });
});

