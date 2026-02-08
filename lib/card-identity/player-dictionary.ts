import type { FieldConfidence } from "@/types";

const PLAYER_DICTIONARY = [
  "Cooper Flagg",
];

function normalizeName(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function matchPlayerFromOcr(ocrText: string): { player?: string; confidence: FieldConfidence } {
  const normalizedOcr = normalizeName(ocrText);
  if (!normalizedOcr) return { confidence: "low" };

  for (const entry of PLAYER_DICTIONARY) {
    const normalizedEntry = normalizeName(entry);
    if (normalizedEntry && normalizedOcr.includes(normalizedEntry)) {
      return { player: entry, confidence: "high" };
    }
  }

  return { confidence: "low" };
}

export function canonicalizeName(raw: string): string {
  const normalized = raw
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
