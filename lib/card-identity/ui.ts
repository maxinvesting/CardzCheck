import type { CardIdentity, FieldConfidence } from "@/types";

export function shouldDisplayYear(
  year: string | undefined,
  _overallConfidence: FieldConfidence | undefined,
  yearConfidence: FieldConfidence | undefined
): boolean {
  if (!year) return false;
  return yearConfidence === "medium" || yearConfidence === "high";
}

export function needsYearConfirmation(
  year: string | undefined,
  _overallConfidence: FieldConfidence | undefined,
  yearConfidence: FieldConfidence | undefined
): boolean {
  if (!year) return true;
  return yearConfidence === "low" || !yearConfidence;
}

export function formatSetLabel(
  cardIdentity?: CardIdentity,
  fallbackSet?: string,
  fallbackParallel?: string
): { setLabel?: string; parallel?: string } {
  const hasIdentity = Boolean(cardIdentity);
  const brand = hasIdentity ? cardIdentity?.brand ?? null : null;
  const setName = hasIdentity ? cardIdentity?.setName ?? null : fallbackSet ?? null;
  const parallel = hasIdentity ? cardIdentity?.parallel ?? null : fallbackParallel ?? null;

  let setLabel: string | undefined;
  if (brand && setName) {
    const normalizedSet = setName.toLowerCase();
    const normalizedBrand = brand.toLowerCase();
    setLabel = normalizedSet.includes(normalizedBrand)
      ? setName
      : `${brand} ${setName}`;
  } else if (setName) {
    setLabel = setName;
  } else if (brand) {
    setLabel = brand;
  }

  return { setLabel, parallel: parallel || undefined };
}

export function formatIdentityHeader(
  cardIdentity?: CardIdentity,
  options?: {
    year?: string;
    fallbackSet?: string;
    fallbackParallel?: string;
  }
): string | undefined {
  const { year, fallbackSet, fallbackParallel } = options ?? {};
  const { setLabel, parallel } = formatSetLabel(cardIdentity, fallbackSet, fallbackParallel);

  let line = "";
  if (year && setLabel) {
    line = `${year} • ${setLabel}`;
  } else if (year) {
    line = year;
  } else if (setLabel) {
    line = setLabel;
  }

  if (parallel) {
    line = line ? `${line} | ${parallel}` : parallel;
  }

  return line || undefined;
}
