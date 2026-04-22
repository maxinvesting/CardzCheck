import type { GradeGraderPerspectives, GradeProbabilities } from "@/types";
import { normalizeDistribution, type GradeOutcome } from "@/lib/grading/gradeProbability";

export type HalfPointGraderKey = "bgs" | "cgc" | "sgc" | "tag";

/** UI labels for the four internal half-point bands (top band = 9.5 key ≈ “10” tier per service). */
export const HALF_POINT_GRADER_ROWS: Array<{
  key: HalfPointGraderKey;
  title: string;
  perspectiveField: keyof GradeGraderPerspectives;
  labels: [string, string, string, string];
}> = [
  {
    key: "bgs",
    title: "BGS",
    perspectiveField: "bgs",
    labels: ["BGS 9.5", "BGS 9", "BGS 8.5", "BGS 8 or lower"],
  },
  {
    key: "cgc",
    title: "CGC",
    perspectiveField: "cgc",
    labels: ["CGC 10", "CGC 9.5", "CGC 9", "CGC 8.5 or lower"],
  },
  {
    key: "sgc",
    title: "SGC",
    perspectiveField: "sgc",
    labels: ["SGC 10", "SGC 9.5", "SGC 9", "SGC 8.5 or lower"],
  },
  {
    key: "tag",
    title: "Tag Rater",
    perspectiveField: "tag",
    labels: ["Tag 10", "Tag 9.5", "Tag 9", "Tag 8.5 or lower"],
  },
];

export function getHalfPointOutcomes(
  probabilities: GradeProbabilities,
  labels: [string, string, string, string],
  key: HalfPointGraderKey
): GradeOutcome[] {
  const map = probabilities[key];
  return normalizeDistribution([
    { label: labels[0], probability: map["9.5"] },
    { label: labels[1], probability: map["9"] },
    { label: labels[2], probability: map["8.5"] },
    { label: labels[3], probability: map["8_or_lower"] },
  ]);
}
