import { inferShopCategoryLabel } from "@/lib/cards/market-category";

export type GradingCardCategory =
  | "sports"
  | "pokemon"
  | "one_piece"
  | "other_tcg";

export type GradingCardMeta = {
  game?: string | null;
  sport?: string | null;
  set_name?: string | null;
  player_name?: string | null;
  year?: string | number | null;
  title?: string | null;
};

export type GradingWeightProfile = {
  centering: number;
  surface: number;
  corners: number;
  edges: number;
};

export type GradingProfile = {
  category: GradingCardCategory;
  label: string;
  weights: GradingWeightProfile;
  strictTcgDefects: boolean;
};

const GRADING_PROFILES: Record<GradingCardCategory, GradingProfile> = {
  sports: {
    category: "sports",
    label: "sports_default",
    weights: { centering: 0.4, surface: 0.3, corners: 0.15, edges: 0.15 },
    strictTcgDefects: false,
  },
  pokemon: {
    category: "pokemon",
    label: "pokemon_strict",
    // Pokemon grading is very sensitive to centering + edge whitening/chipping.
    weights: { centering: 0.34, surface: 0.28, corners: 0.2, edges: 0.18 },
    strictTcgDefects: true,
  },
  one_piece: {
    category: "one_piece",
    label: "one_piece_strict",
    // One Piece is highly sensitive to print lines/rough cuts/surface marks.
    weights: { centering: 0.3, surface: 0.34, corners: 0.18, edges: 0.18 },
    strictTcgDefects: true,
  },
  other_tcg: {
    category: "other_tcg",
    label: "tcg_strict",
    weights: { centering: 0.32, surface: 0.31, corners: 0.19, edges: 0.18 },
    strictTcgDefects: true,
  },
};

function mapCategoryLabelToGradingCategory(label: string): GradingCardCategory {
  if (label === "Pokemon") return "pokemon";
  if (label === "One Piece") return "one_piece";
  if (label === "Other TCG") return "other_tcg";
  return "sports";
}

export function resolveGradingCategory(meta?: GradingCardMeta | null): GradingCardCategory {
  if (!meta) return "sports";
  const inferred = inferShopCategoryLabel(
    {
      game: meta.game,
      sport: meta.sport,
      set: meta.set_name,
      player: meta.player_name,
      title: meta.title,
    },
    "Football"
  );
  return mapCategoryLabelToGradingCategory(inferred);
}

export function resolveGradingProfile(meta?: GradingCardMeta | null): GradingProfile {
  return GRADING_PROFILES[resolveGradingCategory(meta)];
}

export function isTcgCategory(category: GradingCardCategory): boolean {
  return category !== "sports";
}

export function buildCategoryPromptNote(category: GradingCardCategory): string {
  if (category === "pokemon") {
    return [
      "Category profile: Pokemon TCG (strict).",
      "- Penalize PSA 10 probability quickly for edge whitening, corner nicks, print lines, and holo scratches.",
      "- If any visible whitening/chipping exists on multiple edges/corners, cap PSA 10 aggressively.",
      "- Be strict on centering for PSA 10; treat >55/45 as meaningfully negative for gem outcomes.",
    ].join("\n");
  }
  if (category === "one_piece") {
    return [
      "Category profile: One Piece Card Game (strict).",
      "- Penalize PSA 10 probability for print lines, rough cuts, edge chips, and corner factory nicks.",
      "- Treat rough-cut or edge chipping defects as material blockers for gem outcomes.",
      "- Keep centering strict for PSA 10 and explain the gating clearly.",
    ].join("\n");
  }
  if (category === "other_tcg") {
    return [
      "Category profile: TCG strict.",
      "- Apply strict gem-mint gating for edge/corner whitening, print lines, and surface scratches.",
    ].join("\n");
  }
  return "Category profile: Sports trading card.";
}
