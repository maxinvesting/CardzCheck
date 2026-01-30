import type { ParsedQuery, SmartSearchCandidate, SmartSearchMode, LockedConstraints } from "./types";
import { normalizeText } from "./normalize";

export interface ScoredCandidate extends SmartSearchCandidate {
  confidence: number;
  hasLockedConstraintMismatch: boolean;
  mismatchedConstraints: LockedConstraints;
}

interface ModeConfig {
  exactThreshold: number;
  closeMin: number;
}

const MODE_CONFIG: Record<SmartSearchMode, ModeConfig> = {
  watchlist: {
    exactThreshold: 0.85,
    closeMin: 0.3,
  },
  collection: {
    exactThreshold: 0.6,
    closeMin: 0.3,
  },
};

export function scoreCandidates(
  parsed: ParsedQuery,
  candidates: SmartSearchCandidate[],
  mode: SmartSearchMode
): { scored: ScoredCandidate[]; config: ModeConfig } {
  const config = MODE_CONFIG[mode];
  const scored: ScoredCandidate[] = candidates.map((cand) => scoreSingle(parsed, cand, mode));
  scored.sort((a, b) => b.confidence - a.confidence);
  return { scored, config };
}

function scoreSingle(parsed: ParsedQuery, candidate: SmartSearchCandidate, mode: SmartSearchMode): ScoredCandidate {
  const locked = parsed.locked;

  let score = 0;
  const mismatched: LockedConstraints = {};

  // Year
  if (locked.year) {
    if (candidate.year && normalizeText(candidate.year) === normalizeText(locked.year)) {
      score += 0.3;
    } else if (candidate.year) {
      mismatched.year = candidate.year;
    }
  } else if (candidate.year && parsed.original.year && normalizeText(candidate.year) === normalizeText(parsed.original.year)) {
    score += 0.15; // soft, non-locked match
  }

  // Brand
  if (locked.brand) {
    if (candidate.brand && normalizeText(candidate.brand) === normalizeText(locked.brand)) {
      score += 0.3;
    } else if (candidate.brand) {
      mismatched.brand = candidate.brand;
    }
  }

  // Line / set line
  if (locked.line) {
    if (candidate.line && normalizeText(candidate.line) === normalizeText(locked.line)) {
      score += 0.3;
    } else if (candidate.line) {
      mismatched.line = candidate.line;
    }
  }

  // Player
  if (locked.player && candidate.playerName) {
    const playerMatchScore = scorePlayer(locked.player, candidate.playerName);
    score += Math.min(playerMatchScore, 0.1);
  }

  // Card number boost
  if (locked.cardNumber && candidate.cardNumber) {
    if (normalizeText(candidate.cardNumber) === normalizeText(locked.cardNumber)) {
      score += 0.05;
    }
  }

  // Parallel boost
  if (locked.parallel && candidate.parallel) {
    if (normalizeText(candidate.parallel) === normalizeText(locked.parallel)) {
      score += 0.05;
    }
  }

  // Cap score if any locked field mismatched
  const hasLockedMismatch =
    !!mismatched.year || !!mismatched.brand || !!mismatched.line || !!mismatched.cardNumber || !!mismatched.parallel;

  if (hasLockedMismatch) {
    score = Math.min(score, 0.25);
  }

  // Clamp to [0, 1]
  score = Math.max(0, Math.min(1, score));

  return {
    ...candidate,
    confidence: score,
    hasLockedConstraintMismatch: hasLockedMismatch,
    mismatchedConstraints: mismatched,
  };
}

function scorePlayer(queryPlayer: string, candidatePlayer: string): number {
  const qTokens = normalizeText(queryPlayer).split(" ").filter(Boolean);
  const cTokens = normalizeText(candidatePlayer).split(" ").filter(Boolean);

  if (!qTokens.length || !cTokens.length) return 0;

  let matches = 0;
  for (const q of qTokens) {
    if (cTokens.includes(q)) matches += 1;
  }

  // Simple proportional scoring up to 0.1
  const ratio = matches / Math.max(qTokens.length, cTokens.length);
  return Math.min(0.1, ratio * 0.1);
}

