export function normalizeCardNumber(
  value?: string | number | null
): string | undefined {
  if (value === null || value === undefined) return undefined;
  const cleaned = String(value).trim().replace(/^#/, "").replace(/\s+/g, "");
  return cleaned.length > 0 ? cleaned : undefined;
}

export function formatCardNumber(
  value?: string | number | null
): string | undefined {
  const normalized = normalizeCardNumber(value);
  return normalized ? `#${normalized}` : undefined;
}

export function formatGraderGrade(
  grader?: string | null,
  grade?: string | null
): string | undefined {
  const graderValue = grader?.trim();
  const gradeValue = grade?.trim();
  if (graderValue && gradeValue) return `${graderValue} ${gradeValue}`.trim();
  if (graderValue) return graderValue;
  if (gradeValue) return gradeValue;
  return undefined;
}

export function buildCardDisplayName(card: {
  year?: string | null;
  brand?: string | null;
  set_name?: string | null;
  player_name?: string | null;
  variant?: string | null;
  grader?: string | null;
  grade?: string | null;
  card_number?: string | number | null;
}): string {
  const brand = card.brand?.trim() || undefined;
  const setName = card.set_name?.trim() || undefined;
  const setDisplay =
    brand && setName && setName.startsWith(brand)
      ? setName.replace(brand, "").trim()
      : setName;
  const gradeLabel = formatGraderGrade(card.grader, card.grade);
  const numberLabel = formatCardNumber(card.card_number);
  const parts = [
    card.year ?? undefined,
    brand,
    setDisplay,
    card.player_name ?? undefined,
    card.variant ?? undefined,
    gradeLabel,
    numberLabel,
  ].filter(Boolean);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}
