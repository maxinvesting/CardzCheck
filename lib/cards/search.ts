import { normalizeCardNumber } from "@/lib/cards/format";

export interface CardSearchFilters {
  playerId: string;
  setSlug: string;
  year?: string;
  parallel?: string;
  grader?: string;
  grade?: string;
  cardNumber?: string;
}

export interface CardCatalogRow {
  id: string;
  year?: string | null;
  brand?: string | null;
  set_name?: string | null;
  player_name?: string | null;
  variant?: string | null;
  grader?: string | null;
  grade?: string | null;
  card_number?: string | null;
  image_url?: string | null;
  user_image_url?: string | null;
  search_text?: string | null;
  similarity?: number | null;
  title?: string | null;
  source?: "cardCatalog" | "ebayBrowse" | "test" | string | null;
}

export type CardConfidence = "Exact" | "Strong" | "Similar" | "Risky";

export type RejectionReasonCode =
  | "WRONG_PLAYER"
  | "WRONG_SET"
  | "WRONG_PARALLEL"
  | "WRONG_YEAR"
  | "WRONG_CARD_NUMBER"
  | "WRONG_GRADE"
  | "INSERT_NOT_BASE"
  | "DRAFT_NOT_NFL_PRIZM"
  | "LOW_TEXT_SIMILARITY";

export interface ScoredCard extends CardCatalogRow {
  matchCount: number;
  textScore: number;
  score: number;
  confidence: CardConfidence;
  reason: string;
  reasonCodes: RejectionReasonCode[];
  rejectionReasons: RejectionReasonCode[];
  matchPass: 1 | 2 | 3 | 4;
  groupKey: string;
}

export interface RejectedCardCandidate {
  id: string;
  title: string;
  source?: string | null;
  rejectionReasons: RejectionReasonCode[];
}

export interface CardSearchDiagnostics {
  normalizedFilters: NormalizedCardSearchFilters;
  rejected: RejectedCardCandidate[];
  reasonCounts: Record<RejectionReasonCode, number>;
  passCounts: Record<1 | 2 | 3 | 4, number>;
  candidateCount: number;
  acceptedCount: number;
}

export interface ParsedCardSearchPayload {
  filters: CardSearchFilters;
  limit: number;
  relaxOptional: boolean;
}

export type ParseCardSearchResult =
  | { ok: true; value: ParsedCardSearchPayload }
  | { ok: false; error: string; missing: string[] };

export interface CardSearchResult {
  results: ScoredCard[];
  relaxed: boolean;
  canRelax: boolean;
  diagnostics: CardSearchDiagnostics;
  rejections: RejectedCardCandidate[];
}

interface NormalizedGradeParts {
  grader?: string;
  grade?: string;
  isRaw?: boolean;
}

export interface NormalizedCardSearchFilters {
  player: string;
  playerTokens: string[];
  set: string;
  setTokens: string[];
  year?: string;
  parallel?: string;
  grader?: string;
  grade?: string;
  cardNumber?: string;
  wantsPaniniPrizmBaseLine: boolean;
  wantsDraftPicks: boolean;
}

interface CandidateEvaluation {
  row: CardCatalogRow;
  normalized: {
    title: string;
    player: string;
    set: string;
    year?: string;
    parallel?: string;
    grader?: string;
    grade?: string;
    cardNumber?: string;
  };
  matchPass?: 1 | 2 | 3 | 4;
  matchCount: number;
  textScore: number;
  score: number;
  confidence?: CardConfidence;
  reasonCodes: RejectionReasonCode[];
  hardRejectionCodes: RejectionReasonCode[];
  reason: string;
  groupKey: string;
}

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 50;
const MIN_TEXT_SCORE_FOR_STRUCTURED_MATCH = 0.08;

const SPORT_SET_TOKENS = new Set([
  "football",
  "nfl",
  "basketball",
  "nba",
  "baseball",
  "mlb",
  "hockey",
  "nhl",
  "soccer",
  "fifa",
  "uefa",
  "cards",
  "card",
]);

const SET_BRAND_STOP_TOKENS = new Set(["panini"]);

const CONFLICTING_PRIZM_SET_TOKENS = [
  "mosaic",
  "optic",
  "select",
  "donruss",
  "contenders",
  "phoenix",
  "absolute",
  "chronicles",
  "score",
];

const INSERT_TERMS = [
  "emergent",
  "fireworks",
  "brilliance",
  "hype",
  "draft picks",
  "draft pick",
  "instant impact",
  "new recruits",
  "sensational",
  "break",
  "dominance",
];

const CONFIDENCE_RANK: Record<CardConfidence, number> = {
  Exact: 4,
  Strong: 3,
  Similar: 2,
  Risky: 1,
};

const REASON_MESSAGES: Record<RejectionReasonCode, string> = {
  WRONG_PLAYER: "Different player",
  WRONG_SET: "Different set",
  WRONG_PARALLEL: "Different or missing parallel",
  WRONG_YEAR: "Different year",
  WRONG_CARD_NUMBER: "Different or missing card number",
  WRONG_GRADE: "Different or missing grade",
  INSERT_NOT_BASE: "Insert/subset is not the requested base Prizm parallel",
  DRAFT_NOT_NFL_PRIZM: "Draft Picks is not NFL Panini Prizm",
  LOW_TEXT_SIMILARITY: "Low text similarity",
};

export function parseCardSearchPayload(payload: unknown): ParseCardSearchResult {
  const body = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const playerId = cleanRequired(body.playerId);
  const setSlug = cleanRequired(body.setSlug);
  const missing: string[] = [];
  if (!playerId) missing.push("playerId");
  if (!setSlug) missing.push("setSlug");

  if (missing.length > 0) {
    return {
      ok: false,
      error: "playerId and setSlug are required",
      missing,
    };
  }

  const limitInput = typeof body.limit === "number" ? body.limit : Number(body.limit);
  const limit = Number.isFinite(limitInput)
    ? Math.min(Math.max(limitInput, 1), MAX_LIMIT)
    : DEFAULT_LIMIT;
  const relaxOptional = Boolean(body.relaxOptional);

  const parsedGrade = normalizeGradeParts(
    cleanOptional(body.grader),
    cleanOptional(body.grade)
  );

  const filters: CardSearchFilters = {
    playerId,
    setSlug,
    year: normalizeYear(cleanOptional(body.year)),
    parallel: cleanOptional(body.parallel),
    grader: parsedGrade.grader ?? cleanOptional(body.grader),
    grade: parsedGrade.grade ?? cleanOptional(body.grade),
    cardNumber: normalizeCardNumber(cleanOptional(body.cardNumber)),
  };

  return { ok: true, value: { filters, limit, relaxOptional } };
}

export function hasOptionalFilters(filters: CardSearchFilters): boolean {
  return Boolean(
    filters.year ||
      filters.parallel ||
      filters.grader ||
      filters.grade ||
      filters.cardNumber
  );
}

export function filterByOptionalFilters(
  rows: CardCatalogRow[],
  filters: CardSearchFilters
): CardCatalogRow[] {
  const normalized = normalizeFilters(filters);
  return rows.filter((row) => {
    const evaluation = evaluateCandidate(row, normalized);
    return evaluation.matchPass === 1 && evaluation.hardRejectionCodes.length === 0;
  });
}

export function rankCards(
  rows: CardCatalogRow[],
  filters: CardSearchFilters,
  limit: number
): ScoredCard[] {
  return runCardSearch(rows, filters, { relaxOptional: true, limit }).results;
}

export function runCardSearch(
  rows: CardCatalogRow[],
  filters: CardSearchFilters,
  options?: { relaxOptional?: boolean; limit?: number }
): CardSearchResult {
  const normalizedFilters = normalizeFilters(filters);
  const evaluations = rows.map((row) => evaluateCandidate(row, normalizedFilters));
  const accepted = evaluations.filter(
    (evaluation) => evaluation.matchPass && evaluation.hardRejectionCodes.length === 0
  );
  const rejected = evaluations.filter(
    (evaluation) => !evaluation.matchPass || evaluation.hardRejectionCodes.length > 0
  );

  const scored = accepted.map(toScoredCard).sort(compareScoredCards);
  const relaxOptional = Boolean(options?.relaxOptional);
  const limit = options?.limit ?? DEFAULT_LIMIT;
  const nonRisky = scored.filter((card) => card.confidence !== "Risky");
  const primaryResults = relaxOptional || nonRisky.length === 0 ? scored : nonRisky;
  const results = primaryResults.slice(0, limit);
  const canRelax =
    hasOptionalFilters(filters) &&
    !relaxOptional &&
    (scored.some((card) => card.confidence === "Risky") ||
      !scored.some((card) => card.confidence === "Exact"));

  const rejectedCandidates = rejected.map(toRejectedCandidate);
  const reasonCounts = countRejectedReasons(rejectedCandidates);
  const passCounts = countPasses(accepted);

  return {
    results,
    relaxed: relaxOptional,
    canRelax,
    diagnostics: {
      normalizedFilters,
      rejected: rejectedCandidates,
      reasonCounts,
      passCounts,
      candidateCount: rows.length,
      acceptedCount: accepted.length,
    },
    rejections: rejectedCandidates,
  };
}

export function normalizeFilters(filters: CardSearchFilters): NormalizedCardSearchFilters {
  const gradeParts = normalizeGradeParts(filters.grader, filters.grade);
  const set = normalizeResolverText(filters.setSlug);
  const setTokens = tokenize(set);
  const parallel = normalizeParallel(filters.parallel);
  const normalized: NormalizedCardSearchFilters = {
    player: normalizePlayerName(filters.playerId),
    playerTokens: tokenize(normalizePlayerName(filters.playerId)),
    set,
    setTokens,
    year: normalizeYear(filters.year),
    parallel,
    grader: gradeParts.grader,
    grade: gradeParts.grade,
    cardNumber: normalizeCardNumber(filters.cardNumber),
    wantsPaniniPrizmBaseLine: wantsPaniniPrizmBaseLine(set),
    wantsDraftPicks: hasDraftPicks(set),
  };
  return normalized;
}

function cleanRequired(value: unknown): string {
  return typeof value === "string" ? collapseSpaces(value) : "";
}

function cleanOptional(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = collapseSpaces(value);
  return trimmed.length > 0 ? trimmed : undefined;
}

function collapseSpaces(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeResolverText(value?: string | null): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9/#.]+/g, " ")
    .replace(/\bprism\b/g, "prizm")
    .replace(/\bno\.\s*/g, "no ")
    .replace(/\bc\s+j\b/g, "cj")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizePlayerName(value?: string | null): string {
  return normalizeResolverText(value)
    .replace(/\./g, "")
    .replace(/\bc\s*j\b/g, "cj")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value?: string | null): string[] {
  const normalized = normalizeResolverText(value);
  return normalized ? normalized.split(/\s+/).filter(Boolean) : [];
}

function normalizeYear(value?: string | null): string | undefined {
  const match = String(value ?? "").match(/\b(19|20)\d{2}\b/);
  return match?.[0];
}

function normalizeParallel(value?: string | null): string | undefined {
  const normalized = normalizeResolverText(value);
  if (!normalized) return undefined;
  if (/\bbase\b/.test(normalized)) return "base";
  const hasSilver = /\bsilver\b/.test(normalized);
  const hasPrizm = /\bprizm\b/.test(normalized);
  if (hasSilver && (hasPrizm || normalized === "silver")) return "silver prizm";
  if (hasSilver) return "silver prizm";
  return normalized;
}

function normalizeGrader(value?: string | null): string | undefined {
  const normalized = normalizeResolverText(value);
  if (!normalized) return undefined;
  if (/\braw\b|\bungraded\b/.test(normalized)) return "Raw";
  if (/\bpsa\b|professional sports authenticator/.test(normalized)) return "PSA";
  if (/\bbgs\b|\bbeckett\b/.test(normalized)) return "BGS";
  if (/\bsgc\b/.test(normalized)) return "SGC";
  if (/\bcgc\b/.test(normalized)) return "CGC";
  return normalized.toUpperCase();
}

function normalizeGradeParts(grader?: string | null, grade?: string | null): NormalizedGradeParts {
  const combined = [grader, grade].filter(Boolean).join(" ");
  const normalizedCombined = normalizeResolverText(combined);
  const explicitRaw = /\braw\b|\bungraded\b/.test(normalizedCombined);
  if (explicitRaw) return { grader: "Raw", isRaw: true };

  const companyGradeMatch = normalizedCombined.match(
    /\b(psa|bgs|sgc|cgc)\s*([0-9]+(?:\.[0-9]+)?)\b/
  );
  const companyFromCombined = companyGradeMatch?.[1]
    ? normalizeGrader(companyGradeMatch[1])
    : normalizeGrader(grader) ?? normalizeGrader(normalizedCombined);
  const gradeText = normalizeResolverText(grade);
  const gradeMatch =
    companyGradeMatch ??
    gradeText.match(/\b(?:gem mint|mint|pristine)?\s*([0-9]+(?:\.[0-9]+)?)\b/);

  return {
    grader: companyFromCombined && companyFromCombined !== "Raw" ? companyFromCombined : undefined,
    grade: companyGradeMatch ? companyGradeMatch[2] : gradeMatch?.[1],
  };
}

function evaluateCandidate(
  row: CardCatalogRow,
  filters: NormalizedCardSearchFilters
): CandidateEvaluation {
  const source = row.source ?? "cardCatalog";
  const external = source === "ebayBrowse";
  const rawTitle = buildCandidateTitle(row);
  const title = normalizeResolverText(rawTitle);
  const gradeParts = normalizeGradeParts(row.grader, row.grade || row.title);
  const playerText = external
    ? normalizePlayerName(row.title ?? rawTitle)
    : normalizePlayerName(row.player_name ?? row.title ?? "");
  const setText = normalizeResolverText(
    external ? row.title ?? row.set_name ?? rawTitle : row.set_name ?? ""
  );
  const candidateParallel = normalizeParallel(
    row.variant ?? (external ? row.title ?? undefined : undefined)
  );
  const candidateCardNumber = normalizeCardNumber(row.card_number);
  const candidateYear = normalizeYear(row.year) ?? (external ? normalizeYear(row.title) : undefined);

  const normalized = {
    title,
    player: playerText,
    set: setText,
    year: candidateYear,
    parallel: candidateParallel,
    grader: gradeParts.grader,
    grade: gradeParts.grade,
    cardNumber: candidateCardNumber,
  };

  const reasonCodes: RejectionReasonCode[] = [];
  const hardRejectionCodes: RejectionReasonCode[] = [];

  const playerMatches = matchesPlayer(filters.playerTokens, playerText || title);
  if (!playerMatches) {
    hardRejectionCodes.push("WRONG_PLAYER");
  }

  const setResult = evaluateSetMatch(filters, setText);
  if (!setResult.matches) {
    hardRejectionCodes.push(setResult.reason);
  }

  const insertResult = evaluateInsertSafety(filters, title, candidateParallel);
  if (insertResult) {
    hardRejectionCodes.push(insertResult);
  }

  const parallelMatches = matchesParallel(filters.parallel, candidateParallel, title);
  if (filters.parallel && !parallelMatches) {
    reasonCodes.push("WRONG_PARALLEL");
  }

  const yearMatches =
    !filters.year || !candidateYear || normalizeResolverText(candidateYear) === filters.year;
  if (filters.year && !yearMatches) {
    reasonCodes.push("WRONG_YEAR");
  }

  const graderMatches =
    !filters.grader ||
    (filters.grader === "Raw"
      ? !gradeParts.grader || gradeParts.grader === "Raw"
      : gradeParts.grader === filters.grader);
  const gradeMatches = !filters.grade || gradeParts.grade === filters.grade;
  const rawMatches =
    filters.grader !== "Raw" ||
    (!gradeParts.grader && !gradeParts.grade) ||
    gradeParts.grader === "Raw";
  if ((filters.grader && !graderMatches) || (filters.grade && !gradeMatches) || !rawMatches) {
    reasonCodes.push("WRONG_GRADE");
  }

  const cardNumberMatches =
    !filters.cardNumber || normalizeCardNumber(candidateCardNumber) === filters.cardNumber;
  if (filters.cardNumber && !cardNumberMatches) {
    reasonCodes.push("WRONG_CARD_NUMBER");
  }

  const textScore = tokenOverlapScore(buildFilterText(filters), rawTitle);
  const structuredCoreMatches = playerMatches && setResult.matches;
  if (!structuredCoreMatches || textScore < MIN_TEXT_SCORE_FOR_STRUCTURED_MATCH) {
    if (!structuredCoreMatches || !hasStrongStructuredSignals(filters, normalized)) {
      hardRejectionCodes.push("LOW_TEXT_SIMILARITY");
    }
  }

  const matchPass = determineMatchPass({
    coreMatches: structuredCoreMatches,
    filters,
    parallelMatches,
    graderMatches,
    gradeMatches,
    rawMatches,
    yearMatches,
    cardNumberMatches,
  });
  const allReasonCodes = uniqueCodes([...reasonCodes, ...hardRejectionCodes]);
  const matchCount = countMatches({
    filters,
    playerMatches,
    setMatches: setResult.matches,
    parallelMatches,
    graderMatches,
    gradeMatches,
    yearMatches,
    cardNumberMatches,
  });
  const score = matchCount + textScore;
  const confidence = matchPass
    ? determineConfidence(matchPass, reasonCodes, hardRejectionCodes)
    : undefined;

  return {
    row,
    normalized,
    matchPass,
    matchCount,
    textScore,
    score,
    confidence,
    reasonCodes: allReasonCodes,
    hardRejectionCodes: uniqueCodes(hardRejectionCodes),
    reason: buildReason(confidence, allReasonCodes, matchPass),
    groupKey: buildGroupKey(row, gradeParts),
  };
}

function buildCandidateTitle(row: CardCatalogRow): string {
  return (
    row.title ||
    [
      row.year,
      row.brand,
      row.set_name,
      row.player_name,
      row.variant,
      row.grader,
      row.grade,
      row.card_number ? `#${normalizeCardNumber(row.card_number)}` : undefined,
    ]
      .filter(Boolean)
      .join(" ")
  );
}

function matchesPlayer(wantedTokens: string[], candidateText: string): boolean {
  if (wantedTokens.length === 0) return true;
  const candidateTokens = new Set(tokenize(candidateText));
  return wantedTokens.every((token) => candidateTokens.has(token));
}

function evaluateSetMatch(
  filters: NormalizedCardSearchFilters,
  candidateSetText: string
): { matches: true } | { matches: false; reason: RejectionReasonCode } {
  const candidate = normalizeResolverText(candidateSetText);
  if (!candidate) return { matches: false, reason: "WRONG_SET" };

  if (filters.wantsPaniniPrizmBaseLine) {
    if (hasDraftPicks(candidate) && !filters.wantsDraftPicks) {
      return { matches: false, reason: "DRAFT_NOT_NFL_PRIZM" };
    }
    if (!hasToken(candidate, "prizm")) {
      return { matches: false, reason: "WRONG_SET" };
    }
    for (const conflict of CONFLICTING_PRIZM_SET_TOKENS) {
      if (hasToken(candidate, conflict) && !hasToken(filters.set, conflict)) {
        return { matches: false, reason: "WRONG_SET" };
      }
    }
    return { matches: true };
  }

  const wantedTokens = filters.setTokens.filter(
    (token) => !SPORT_SET_TOKENS.has(token) && !SET_BRAND_STOP_TOKENS.has(token)
  );
  const candidateTokens = new Set(tokenize(candidate));
  const matches = wantedTokens.length > 0
    ? wantedTokens.every((token) => candidateTokens.has(token))
    : filters.setTokens.every((token) => candidateTokens.has(token));
  return matches ? { matches: true } : { matches: false, reason: "WRONG_SET" };
}

function evaluateInsertSafety(
  filters: NormalizedCardSearchFilters,
  candidateTitle: string,
  candidateParallel?: string
): RejectionReasonCode | null {
  if (filters.wantsPaniniPrizmBaseLine && hasDraftPicks(candidateTitle) && !filters.wantsDraftPicks) {
    return "DRAFT_NOT_NFL_PRIZM";
  }

  if (!filters.parallel) return null;
  const desiredIncludesInsert = INSERT_TERMS.some((term) => filters.parallel?.includes(term));
  if (desiredIncludesInsert) return null;

  const titleHasInsert = INSERT_TERMS.some((term) => candidateTitle.includes(term));
  const parallelHasInsert = INSERT_TERMS.some((term) => candidateParallel?.includes(term));
  if (titleHasInsert || parallelHasInsert) return "INSERT_NOT_BASE";
  return null;
}

function matchesParallel(
  wantedParallel: string | undefined,
  candidateParallel: string | undefined,
  title: string
): boolean {
  if (!wantedParallel) return true;
  if (!candidateParallel) {
    if (wantedParallel === "silver prizm") {
      return hasToken(title, "silver") && hasToken(title, "prizm");
    }
    return wantedParallel.split(" ").every((token) => hasToken(title, token));
  }
  if (wantedParallel === candidateParallel) return true;
  if (wantedParallel === "silver prizm") {
    return candidateParallel === "silver prizm" || (hasToken(title, "silver") && hasToken(title, "prizm"));
  }
  return wantedParallel
    .split(" ")
    .filter(Boolean)
    .every((token) => hasToken(candidateParallel, token) || hasToken(title, token));
}

function determineMatchPass(args: {
  coreMatches: boolean;
  filters: NormalizedCardSearchFilters;
  parallelMatches: boolean;
  graderMatches: boolean;
  gradeMatches: boolean;
  rawMatches: boolean;
  yearMatches: boolean;
  cardNumberMatches: boolean;
}): 1 | 2 | 3 | 4 | undefined {
  if (!args.coreMatches) return undefined;
  const parallelOk = !args.filters.parallel || args.parallelMatches;
  const graderOk = !args.filters.grader || args.graderMatches;
  const gradeOk = !args.filters.grade || args.gradeMatches;
  const yearOk = !args.filters.year || args.yearMatches;
  const cardNumberOk = !args.filters.cardNumber || args.cardNumberMatches;
  const slabOk = graderOk && gradeOk && args.rawMatches;

  if (parallelOk && slabOk && yearOk && cardNumberOk) return 1;
  if (parallelOk && slabOk) return 2;
  if (parallelOk) return 3;
  return 4;
}

function determineConfidence(
  matchPass: 1 | 2 | 3 | 4,
  reasonCodes: RejectionReasonCode[],
  hardRejectionCodes: RejectionReasonCode[]
): CardConfidence {
  if (hardRejectionCodes.length > 0) return "Risky";
  if (matchPass === 1 && reasonCodes.length === 0) return "Exact";
  if (matchPass === 1 || matchPass === 2) return "Strong";
  if (matchPass === 3 && !reasonCodes.includes("WRONG_PARALLEL")) return "Similar";
  return "Risky";
}

function countMatches(args: {
  filters: NormalizedCardSearchFilters;
  playerMatches: boolean;
  setMatches: boolean;
  parallelMatches: boolean;
  graderMatches: boolean;
  gradeMatches: boolean;
  yearMatches: boolean;
  cardNumberMatches: boolean;
}): number {
  let matches = 0;
  if (args.playerMatches) matches += 1;
  if (args.setMatches) matches += 1;
  if (args.filters.parallel && args.parallelMatches) matches += 1;
  if (args.filters.grader && args.graderMatches) matches += 1;
  if (args.filters.grade && args.gradeMatches) matches += 1;
  if (args.filters.year && args.yearMatches) matches += 1;
  if (args.filters.cardNumber && args.cardNumberMatches) matches += 1;
  return matches;
}

function hasStrongStructuredSignals(
  filters: NormalizedCardSearchFilters,
  normalized: CandidateEvaluation["normalized"]
): boolean {
  const hasPlayer = matchesPlayer(filters.playerTokens, normalized.player || normalized.title);
  const hasSet = evaluateSetMatch(filters, normalized.set).matches;
  const hasParallel = !filters.parallel || matchesParallel(filters.parallel, normalized.parallel, normalized.title);
  return hasPlayer && hasSet && hasParallel;
}

function buildFilterText(filters: NormalizedCardSearchFilters): string {
  return [
    filters.year,
    filters.player,
    filters.set,
    filters.parallel,
    filters.grader,
    filters.grade,
    filters.cardNumber,
  ]
    .filter(Boolean)
    .join(" ");
}

function tokenOverlapScore(a: string, b: string): number {
  const tokensA = new Set(tokenize(a));
  const tokensB = new Set(tokenize(b));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let intersection = 0;
  tokensA.forEach((token) => {
    if (tokensB.has(token)) intersection += 1;
  });
  const union = tokensA.size + tokensB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

function toScoredCard(evaluation: CandidateEvaluation): ScoredCard {
  return {
    ...evaluation.row,
    matchCount: evaluation.matchCount,
    textScore: evaluation.textScore,
    score: evaluation.score,
    confidence: evaluation.confidence ?? "Risky",
    reason: evaluation.reason,
    reasonCodes: evaluation.reasonCodes,
    rejectionReasons: evaluation.reasonCodes,
    matchPass: evaluation.matchPass ?? 4,
    groupKey: evaluation.groupKey,
  };
}

function compareScoredCards(a: ScoredCard, b: ScoredCard): number {
  const confidenceDiff = CONFIDENCE_RANK[b.confidence] - CONFIDENCE_RANK[a.confidence];
  if (confidenceDiff !== 0) return confidenceDiff;
  if (a.matchPass !== b.matchPass) return a.matchPass - b.matchPass;
  if (b.matchCount !== a.matchCount) return b.matchCount - a.matchCount;
  if (b.textScore !== a.textScore) return b.textScore - a.textScore;
  return compareYearDesc(a.year, b.year);
}

function toRejectedCandidate(evaluation: CandidateEvaluation): RejectedCardCandidate {
  return {
    id: evaluation.row.id,
    title: buildCandidateTitle(evaluation.row),
    source: evaluation.row.source,
    rejectionReasons:
      evaluation.hardRejectionCodes.length > 0
        ? evaluation.hardRejectionCodes
        : evaluation.reasonCodes.length > 0
        ? evaluation.reasonCodes
        : ["LOW_TEXT_SIMILARITY"],
  };
}

function countRejectedReasons(
  rejected: RejectedCardCandidate[]
): Record<RejectionReasonCode, number> {
  const counts = emptyReasonCounts();
  for (const candidate of rejected) {
    for (const reason of candidate.rejectionReasons) {
      counts[reason] += 1;
    }
  }
  return counts;
}

function countPasses(
  evaluations: CandidateEvaluation[]
): Record<1 | 2 | 3 | 4, number> {
  const counts: Record<1 | 2 | 3 | 4, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const evaluation of evaluations) {
    if (evaluation.matchPass) counts[evaluation.matchPass] += 1;
  }
  return counts;
}

function emptyReasonCounts(): Record<RejectionReasonCode, number> {
  return {
    WRONG_PLAYER: 0,
    WRONG_SET: 0,
    WRONG_PARALLEL: 0,
    WRONG_YEAR: 0,
    WRONG_CARD_NUMBER: 0,
    WRONG_GRADE: 0,
    INSERT_NOT_BASE: 0,
    DRAFT_NOT_NFL_PRIZM: 0,
    LOW_TEXT_SIMILARITY: 0,
  };
}

function buildReason(
  confidence: CardConfidence | undefined,
  codes: RejectionReasonCode[],
  matchPass?: 1 | 2 | 3 | 4
): string {
  if (confidence === "Exact") return "All provided identity fields match.";
  if (codes.length > 0) {
    return uniqueCodes(codes)
      .map((code) => REASON_MESSAGES[code])
      .join("; ");
  }
  if (matchPass === 2) return "Core card identity and slab match; year or card number was optional.";
  if (matchPass === 3) return "Player, set, and parallel match; grade is flexible.";
  if (matchPass === 4) return "Player and set match; review parallel and grade.";
  return "No reliable identity match.";
}

function buildGroupKey(row: CardCatalogRow, gradeParts: NormalizedGradeParts): string {
  const parallel = normalizeParallel(row.variant ?? row.title) ?? "Unknown parallel";
  const grade = [gradeParts.grader, gradeParts.grade].filter(Boolean).join(" ") || "Any grade";
  return `${toDisplayLabel(parallel)} / ${grade}`;
}

function toDisplayLabel(value: string): string {
  return value
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function uniqueCodes(codes: RejectionReasonCode[]): RejectionReasonCode[] {
  return Array.from(new Set(codes));
}

function hasToken(text: string, token: string): boolean {
  return new Set(tokenize(text)).has(token);
}

function hasDraftPicks(text: string): boolean {
  return /\bdraft picks?\b/.test(normalizeResolverText(text));
}

function wantsPaniniPrizmBaseLine(set: string): boolean {
  return hasToken(set, "prizm") && !hasDraftPicks(set);
}

function compareYearDesc(a?: string | null, b?: string | null): number {
  const aNum = Number(a);
  const bNum = Number(b);
  if (Number.isFinite(aNum) && Number.isFinite(bNum)) {
    return bNum - aNum;
  }
  return String(b ?? "").localeCompare(String(a ?? ""));
}
