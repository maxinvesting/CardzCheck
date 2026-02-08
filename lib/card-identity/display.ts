import type { CardIdentity, FieldConfidence } from "@/lib/card-identity/types";

/** Minimal identity shape for display (e.g. from CollectionItem with year/set_name only). */
export type CardIdentityDisplayInput = Pick<
  CardIdentity,
  "year" | "brand" | "setName" | "subset" | "parallel"
> & {
  fieldConfidence?: Record<string, FieldConfidence>;
  player?: string | null;
};

export type FieldStatus = "ok" | "needs_confirmation" | "unknown";

const FIELD_KEYS = ["year", "brand", "setName", "subset", "parallel", "player"] as const;
export type IdentityField = (typeof FIELD_KEYS)[number];

function hasValue(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (typeof v === "number") return Number.isFinite(v);
  return true;
}

/**
 * Returns a collector-native subtitle string with safe fallbacks.
 * Never shows "null" or extra separators; only includes parts that exist.
 *
 * Preferred: "{year} • {brand} {setName} | {parallel/subset}"
 * If brand missing: "{year} • {setName} | {parallel}"
 * If year missing: "{brand} {setName} | {parallel}"
 * If parallel missing: "{year} • {brand} {setName}"
 */
export function formatCardSubtitle(identity: CardIdentityDisplayInput | null | undefined): string {
  if (!identity) return "";

  const rawYear =
    identity.year != null && Number.isFinite(identity.year) ? String(identity.year) : null;
  const yearConfidence = identity.fieldConfidence?.year;
  const year =
    rawYear && yearConfidence === "low"
      ? null
      : rawYear;
  const brand = identity.brand != null && String(identity.brand).trim() !== "" ? String(identity.brand).trim() : null;
  const setName =
    identity.setName != null && String(identity.setName).trim() !== "" ? String(identity.setName).trim() : null;
  const parallelOrSubset =
    identity.parallel != null && String(identity.parallel).trim() !== ""
      ? String(identity.parallel).trim()
      : identity.subset != null && String(identity.subset).trim() !== ""
        ? String(identity.subset).trim()
        : null;

  const setPart =
    brand && setName
      ? setName.toLowerCase().includes(brand.toLowerCase())
        ? setName
        : `${brand} ${setName}`
      : setName ?? brand ?? null;

  const leftParts: string[] = [];
  if (year) leftParts.push(year);
  if (setPart) leftParts.push(setPart);
  const left = leftParts.join(" • ");
  if (parallelOrSubset) {
    return left ? `${left} | ${parallelOrSubset}` : parallelOrSubset;
  }
  return left;
}

/**
 * Status for a single identity field based on presence and fieldConfidence.
 * - ok: value present and confidence high/medium
 * - needs_confirmation: value present but confidence low or missing
 * - unknown: no value (null/empty)
 */
export function getFieldStatus(
  identity: (CardIdentityDisplayInput & { player?: string | null }) | null | undefined,
  field: IdentityField
): FieldStatus {
  if (!identity) return "unknown";

  const value =
    field === "player"
      ? identity.player
      : field === "year"
        ? identity.year
        : field === "brand"
          ? identity.brand
          : field === "setName"
            ? identity.setName
            : field === "subset"
              ? identity.subset
              : field === "parallel"
                ? identity.parallel
                : undefined;

  if (!hasValue(value)) return "unknown";

  const conf = identity.fieldConfidence?.[field];
  if (conf === "high" || conf === "medium") return "ok";
  if (conf === "low" || (field in (identity.fieldConfidence ?? {}))) return "needs_confirmation";
  return "needs_confirmation";
}
