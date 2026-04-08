import type { GradeProbabilities, HalfPointGradeDistribution } from "@/types";

export function normalizeHalfPointGradeDistribution(
  map: HalfPointGradeDistribution
): HalfPointGradeDistribution {
  const total =
    map["9.5"] + map["9"] + map["8.5"] + map["8_or_lower"];
  if (!total) return map;
  return {
    "9.5": map["9.5"] / total,
    "9": map["9"] / total,
    "8.5": map["8.5"] / total,
    "8_or_lower": map["8_or_lower"] / total,
  };
}

/**
 * BGS 9.5 is much rarer than PSA 10; coefficients sum to 1 per PSA bucket.
 *   PSA 10  → 30% 9.5 | 65% 9 | 5% 8.5 | 0% 8-
 *   PSA 9   → 0 | 78% 9 | 17% 8.5 | 5% 8-
 *   PSA 8   → 0 | 0 | 72% 8.5 | 28% 8-
 *   PSA 7-  → 0 | 0 | 0 | 100% 8-
 */
export function mapPsaToBgs(psa: GradeProbabilities["psa"]): HalfPointGradeDistribution {
  const bgs95 = psa["10"] * 0.3;
  const bgs9 = psa["10"] * 0.65 + psa["9"] * 0.78;
  const bgs85 = psa["10"] * 0.05 + psa["9"] * 0.17 + psa["8"] * 0.72;
  const bgs8orLower = psa["9"] * 0.05 + psa["8"] * 0.28 + psa["7_or_lower"];
  return normalizeHalfPointGradeDistribution({
    "9.5": bgs95,
    "9": bgs9,
    "8.5": bgs85,
    "8_or_lower": bgs8orLower,
  });
}

/**
 * CGC (comics/cards): strict surface/centering culture; slightly harder top gem than BGS.
 *   PSA 10  → 22% | 68% | 8% | 2%
 *   PSA 9   → 0 | 75% | 18% | 7%
 *   PSA 8   → 0 | 0 | 70% | 30%
 *   PSA 7-  → 0 | 0 | 0 | 100%
 */
export function mapPsaToCgc(psa: GradeProbabilities["psa"]): HalfPointGradeDistribution {
  const top = psa["10"] * 0.22;
  const nine = psa["10"] * 0.68 + psa["9"] * 0.75;
  const eightFive = psa["10"] * 0.08 + psa["9"] * 0.18 + psa["8"] * 0.7;
  const rest = psa["10"] * 0.02 + psa["9"] * 0.07 + psa["8"] * 0.3 + psa["7_or_lower"];
  return normalizeHalfPointGradeDistribution({
    "9.5": top,
    "9": nine,
    "8.5": eightFive,
    "8_or_lower": rest,
  });
}

/**
 * SGC: similar tier structure; slightly more mass at 9.5 from PSA 10 vs BGS.
 *   PSA 10  → 35% | 62% | 3% | 0%
 *   PSA 9   → 0 | 80% | 15% | 5%
 *   PSA 8   → 0 | 0 | 75% | 25%
 *   PSA 7-  → 0 | 0 | 0 | 100%
 */
export function mapPsaToSgc(psa: GradeProbabilities["psa"]): HalfPointGradeDistribution {
  const top = psa["10"] * 0.35;
  const nine = psa["10"] * 0.62 + psa["9"] * 0.8;
  const eightFive = psa["10"] * 0.03 + psa["9"] * 0.15 + psa["8"] * 0.75;
  const rest = psa["9"] * 0.05 + psa["8"] * 0.25 + psa["7_or_lower"];
  return normalizeHalfPointGradeDistribution({
    "9.5": top,
    "9": nine,
    "8.5": eightFive,
    "8_or_lower": rest,
  });
}

/**
 * Tag Rater: tech-forward visual grading; between BGS and CGC strictness on top end.
 *   PSA 10  → 28% | 66% | 5% | 1%
 *   PSA 9   → 0 | 77% | 18% | 5%
 *   PSA 8   → 0 | 0 | 73% | 27%
 *   PSA 7-  → 0 | 0 | 0 | 100%
 */
export function mapPsaToTag(psa: GradeProbabilities["psa"]): HalfPointGradeDistribution {
  const top = psa["10"] * 0.28;
  const nine = psa["10"] * 0.66 + psa["9"] * 0.77;
  const eightFive = psa["10"] * 0.05 + psa["9"] * 0.18 + psa["8"] * 0.73;
  const rest = psa["10"] * 0.01 + psa["9"] * 0.05 + psa["8"] * 0.27 + psa["7_or_lower"];
  return normalizeHalfPointGradeDistribution({
    "9.5": top,
    "9": nine,
    "8.5": eightFive,
    "8_or_lower": rest,
  });
}

/** Attach CGC/SGC/TAG from PSA; keep the pipeline’s final BGS (model or mapped). */
export function deriveHalfPointGradersFromPsa(
  psa: GradeProbabilities["psa"],
  bgs: HalfPointGradeDistribution
): {
  bgs: HalfPointGradeDistribution;
  cgc: HalfPointGradeDistribution;
  sgc: HalfPointGradeDistribution;
  tag: HalfPointGradeDistribution;
} {
  return {
    bgs: normalizeHalfPointGradeDistribution(bgs),
    cgc: mapPsaToCgc(psa),
    sgc: mapPsaToSgc(psa),
    tag: mapPsaToTag(psa),
  };
}
