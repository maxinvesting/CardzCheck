import type { ShopListing } from "@/types/shop";

type ListingPreview = Pick<
  ShopListing,
  "player_name" | "year" | "set_brand" | "parallel_variant"
>;

export function formatUsd(value: number, digits = 0): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function buildListingTitle(listing: ListingPreview): string {
  const base = [listing.player_name, listing.year, listing.set_brand]
    .filter(Boolean)
    .join(" ");

  if (listing.parallel_variant) {
    return `${base} ${listing.parallel_variant}`;
  }

  return base;
}

export function getGradeChipClass(grade: string | null | undefined): string {
  const normalized = (grade ?? "").toLowerCase();

  if (normalized.includes("10")) {
    return "border border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (normalized.includes("9")) {
    return "border border-sky-200 bg-sky-50 text-sky-700";
  }

  if (normalized.includes("raw") || normalized.includes("ungraded") || !normalized) {
    return "border border-amber-200 bg-amber-50 text-amber-700";
  }

  return "border border-slate-200 bg-slate-50 text-slate-700";
}

export interface CmvDeltaPresentation {
  cmvLabel: string | null;
  deltaLabel: string;
  deltaClass: string;
}

export function getCmvDeltaPresentation(
  price: number,
  cmv: number | null
): CmvDeltaPresentation {
  if (cmv == null || cmv <= 0) {
    return {
      cmvLabel: null,
      deltaLabel: "CMV updating",
      deltaClass: "text-slate-500",
    };
  }

  const deltaPct = Math.round(((price - cmv) / cmv) * 100);

  if (Math.abs(deltaPct) <= 1) {
    return {
      cmvLabel: `CMV ${formatUsd(cmv, 0)}`,
      deltaLabel: "~ at market",
      deltaClass: "text-slate-600",
    };
  }

  if (deltaPct < 0) {
    return {
      cmvLabel: `CMV ${formatUsd(cmv, 0)}`,
      deltaLabel: `${Math.abs(deltaPct)}% below market`,
      deltaClass: "text-emerald-600",
    };
  }

  return {
    cmvLabel: `CMV ${formatUsd(cmv, 0)}`,
    deltaLabel: `${deltaPct}% above market`,
    deltaClass: "text-amber-600",
  };
}

export function getShippingLabel(shippingCost: number): string {
  if (!Number.isFinite(shippingCost) || shippingCost <= 0) {
    return "Free shipping";
  }

  const decimals = Number.isInteger(shippingCost) ? 0 : 2;
  return `${formatUsd(shippingCost, decimals)} shipping`;
}
