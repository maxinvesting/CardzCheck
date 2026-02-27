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
    return "bg-emerald-500/10 border border-emerald-400/40 text-emerald-300";
  }

  if (normalized.includes("9")) {
    return "bg-sky-500/10 border border-sky-400/40 text-sky-300";
  }

  if (normalized.includes("raw") || normalized.includes("ungraded") || !normalized) {
    return "bg-amber-500/10 border border-amber-400/40 text-amber-300";
  }

  return "bg-slate-800/80 border border-slate-700/70 text-slate-300";
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
      deltaLabel: "≈ at market",
      deltaClass: "text-slate-400",
    };
  }

  if (deltaPct < 0) {
    return {
      cmvLabel: `CMV ${formatUsd(cmv, 0)}`,
      deltaLabel: `▼ ${Math.abs(deltaPct)}% below market`,
      deltaClass: "text-emerald-400",
    };
  }

  return {
    cmvLabel: `CMV ${formatUsd(cmv, 0)}`,
    deltaLabel: `▲ ${deltaPct}% above market`,
    deltaClass: "text-amber-300",
  };
}

export function getShippingLabel(shippingCost: number): string {
  if (!Number.isFinite(shippingCost) || shippingCost <= 0) {
    return "Free shipping";
  }

  const decimals = Number.isInteger(shippingCost) ? 0 : 2;
  return `${formatUsd(shippingCost, decimals)} shipping`;
}
