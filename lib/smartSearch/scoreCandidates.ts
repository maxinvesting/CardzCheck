import type { ParsedQuery, SmartSearchCandidate, SmartSearchMode, LockedConstraints } from "./types";
import { extractGraderAndGrade, normalizeText, tokenize } from "./normalize";

export interface ScoredCandidate extends SmartSearchCandidate {
  confidence: number;
  score: number;
  maxScore: number;
  hasLockedConstraintMismatch: boolean;
  mismatchedConstraints: LockedConstraints;
  scoreBreakdown: Record<string, number>;
}

interface ModeConfig {
  exactThreshold: number; // normalized (0..1)
  closeMin: number; // normalized (0..1)
  exactScoreThreshold: number; // raw score
  closeScoreMin: number; // raw score
  maxScore: number;
}

const WEIGHTS = {
  player: 8,
  set: 5,
  brand: 3,
  year: 3,
  variant: 2,
  grader: 2,
  grade: 2,
  cardNumber: 3,
  text: 4,
} as const;

// Scoring notes:
// - We compute a weighted sum across query signals (player, set/brand, year, etc.).
// - Each signal contributes a proportion based on token overlap, so partial matches still score.
// - Locked-field mismatches apply penalties instead of hard-failing.
// - A small fuzzy token-overlap score keeps punctuation/spacing variants ("cj" vs "c.j.") aligned.

const MODE_RATIOS: Record<SmartSearchMode, { exact: number; close: number }> = {
  watchlist: { exact: 0.78, close: 0.38 },
  collection: { exact: 0.7, close: 0.32 },
};

export function scoreCandidates(
  parsed: ParsedQuery,
  candidates: SmartSearchCandidate[],
  mode: SmartSearchMode
): { scored: ScoredCandidate[]; config: ModeConfig } {
  const config = buildConfig(parsed, mode);
  const scored: ScoredCandidate[] = candidates.map((cand) => scoreSingle(parsed, cand, config));
  scored.sort((a, b) => b.score - a.score);
  return { scored, config };
}

function buildConfig(parsed: ParsedQuery, mode: SmartSearchMode): ModeConfig {
  const signals = parsed.signals;

  let maxScore = 0;
  if (signals.player) maxScore += WEIGHTS.player;
  if (signals.setName || signals.line) maxScore += WEIGHTS.set;
  if (signals.brand) maxScore += WEIGHTS.brand;
  if (signals.year) maxScore += WEIGHTS.year;
  if (signals.variantTokens.length > 0) maxScore += WEIGHTS.variant;
  if (signals.grader) maxScore += WEIGHTS.grader;
  if (signals.grade) maxScore += WEIGHTS.grade;
  if (signals.cardNumber) maxScore += WEIGHTS.cardNumber;

  // Always include a small fuzzy-text component
  maxScore += WEIGHTS.text;

  const ratios = MODE_RATIOS[mode];
  const exactScoreThreshold = Math.max(WEIGHTS.player, maxScore * ratios.exact);
  const closeScoreMin = Math.max(WEIGHTS.text, maxScore * ratios.close);

  return {
    exactThreshold: exactScoreThreshold / maxScore,
    closeMin: closeScoreMin / maxScore,
    exactScoreThreshold,
    closeScoreMin,
    maxScore,
  };
}

function scoreSingle(
  parsed: ParsedQuery,
  candidate: SmartSearchCandidate,
  config: ModeConfig
): ScoredCandidate {
  const signals = parsed.signals;
  const breakdown: Record<string, number> = {};
  const mismatched: LockedConstraints = {};

  let score = 0;

  const candidateText = candidate.searchText || candidate.title;
  const candidateTokens = tokenize(candidateText);
  const queryTokens = parsed.tokens;

  // Player match (strong signal)
  if (signals.player) {
    const playerTokens = tokenize(signals.player);
    const haystackTokens = tokenize(candidate.playerName || candidateText);
    const playerRatio = tokenOverlap(playerTokens, haystackTokens, true);
    const playerScore = WEIGHTS.player * playerRatio;
    breakdown.player = playerScore;
    score += playerScore;
  }

  // Set / line match
  if (signals.setName || signals.line) {
    const querySet = signals.setName || signals.line || "";
    const candidateSet = candidate.setName || candidate.line || "";
    const setRatio = tokenOverlap(tokenize(querySet), tokenize(candidateSet || candidateText), true);
    const setScore = WEIGHTS.set * setRatio;
    breakdown.set = setScore;
    score += setScore;
  }

  // Brand match
  if (signals.brand) {
    const candidateBrand = normalizeText(candidate.brand || candidate.setName || "");
    const queryBrand = normalizeText(signals.brand);
    const brandMatch = candidateBrand === queryBrand || candidateBrand.includes(queryBrand);
    const brandScore = brandMatch ? WEIGHTS.brand : 0;
    breakdown.brand = brandScore;
    score += brandScore;
  }

  // Year match
  if (signals.year) {
    const yearMatch = normalizeText(candidate.year || "") === normalizeText(signals.year);
    const yearScore = yearMatch ? WEIGHTS.year : 0;
    breakdown.year = yearScore;
    score += yearScore;
  }

  // Variant / parallel match (use query tokens if present)
  if (signals.variantTokens.length > 0) {
    const candidateVariantText = candidate.variant || candidate.parallel || candidateText;
    const variantRatio = tokenOverlap(signals.variantTokens, tokenize(candidateVariantText), false);
    const variantScore = WEIGHTS.variant * variantRatio;
    breakdown.variant = variantScore;
    score += variantScore;
  }

  // Grader + grade
  const candidateGrade = candidate.grader && candidate.grade
    ? { grader: candidate.grader, grade: candidate.grade }
    : extractGraderAndGrade(candidateText);

  if (signals.grader) {
    const graderMatch =
      normalizeText(candidateGrade.grader || "") === normalizeText(signals.grader);
    const graderScore = graderMatch ? WEIGHTS.grader : 0;
    breakdown.grader = graderScore;
    score += graderScore;
  }

  if (signals.grade) {
    const gradeMatch = normalizeText(candidateGrade.grade || "") === normalizeText(signals.grade);
    const gradeScore = gradeMatch ? WEIGHTS.grade : 0;
    breakdown.grade = gradeScore;
    score += gradeScore;
  }

  // Card number
  if (signals.cardNumber) {
    const cardMatch = normalizeCardNumber(candidate.cardNumber) === normalizeCardNumber(signals.cardNumber);
    const cardScore = cardMatch ? WEIGHTS.cardNumber : 0;
    breakdown.cardNumber = cardScore;
    score += cardScore;
  }

  // Fuzzy text similarity (token overlap/Jaccard-style)
  const textRatio = tokenOverlap(queryTokens, candidateTokens, true);
  const textScore = WEIGHTS.text * textRatio;
  breakdown.text = textScore;
  score += textScore;

  // Penalties for locked mismatches (keep specific but never hard-fail)
  let penalty = 0;
  const locked = parsed.locked;

  if (locked.year && candidate.year && normalizeText(candidate.year) !== normalizeText(locked.year)) {
    mismatched.year = candidate.year;
    penalty += WEIGHTS.year * 0.6;
  }

  if (locked.brand && candidate.brand && normalizeText(candidate.brand) !== normalizeText(locked.brand)) {
    mismatched.brand = candidate.brand;
    penalty += WEIGHTS.brand * 0.6;
  }

  if (locked.line && candidate.line && normalizeText(candidate.line) !== normalizeText(locked.line)) {
    mismatched.line = candidate.line;
    penalty += WEIGHTS.set * 0.6;
  }

  if (locked.cardNumber && candidate.cardNumber && normalizeCardNumber(candidate.cardNumber) !== normalizeCardNumber(locked.cardNumber)) {
    mismatched.cardNumber = candidate.cardNumber;
    penalty += WEIGHTS.cardNumber * 0.6;
  }

  if (locked.parallel && candidate.parallel && normalizeText(candidate.parallel) !== normalizeText(locked.parallel)) {
    mismatched.parallel = candidate.parallel;
    penalty += WEIGHTS.variant * 0.5;
  }

  if (locked.grader && candidateGrade.grader && normalizeText(candidateGrade.grader) !== normalizeText(locked.grader)) {
    mismatched.grader = candidateGrade.grader;
    penalty += WEIGHTS.grader * 0.5;
  }

  if (locked.grade && candidateGrade.grade && normalizeText(candidateGrade.grade) !== normalizeText(locked.grade)) {
    mismatched.grade = candidateGrade.grade;
    penalty += WEIGHTS.grade * 0.5;
  }

  if (penalty > 0) {
    breakdown.penalty = -penalty;
    score = Math.max(0, score - penalty);
  }

  const confidence = config.maxScore > 0 ? Math.max(0, Math.min(1, score / config.maxScore)) : 0;
  breakdown.total = score;

  return {
    ...candidate,
    score,
    maxScore: config.maxScore,
    confidence,
    hasLockedConstraintMismatch: Object.keys(mismatched).length > 0,
    mismatchedConstraints: mismatched,
    scoreBreakdown: breakdown,
  };
}

function tokenOverlap(needles: string[], haystack: string[], relativeToNeedles: boolean): number {
  if (!needles.length || !haystack.length) return 0;
  const needleSet = new Set(needles.map((t) => normalizeText(t)).filter(Boolean));
  const haystackSet = new Set(haystack.map((t) => normalizeText(t)).filter(Boolean));
  if (!needleSet.size || !haystackSet.size) return 0;

  let matches = 0;
  for (const token of needleSet) {
    if (haystackSet.has(token)) matches += 1;
  }

  const denom = relativeToNeedles ? needleSet.size : Math.max(needleSet.size, haystackSet.size);
  return denom > 0 ? matches / denom : 0;
}

function normalizeCardNumber(value?: string): string {
  if (!value) return "";
  const normalized = normalizeText(value).replace(/\s+/g, "");
  return normalized.replace(/^no/, "").replace(/^#/, "");
}
