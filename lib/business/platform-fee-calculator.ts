/**
 * Multi-platform fee calculator for trading card sales.
 *
 * Pure math — no API calls, no external dependencies.
 * All inputs and outputs are in dollars (not cents).
 *
 * Platforms:
 *   ebay            — 13.25% FVF (12.35% Top Rated Plus), payment processing included
 *   whatnot         — 8% seller fee + 2.9% + $0.30 payment processing
 *   comc            — $1 submission + 10% commission, $0 shipping to seller
 *   personal_website — 2.9% + $0.30 Stripe/Shopify, no platform fee
 *   card_show       — no fees, optional table cost amortized per card
 *   facebook        — 0% local/cash, 5% if shipped
 */

export type PlatformId =
  | "ebay"
  | "whatnot"
  | "comc"
  | "personal_website"
  | "card_show"
  | "facebook";

export const PLATFORM_NAMES: Record<PlatformId, string> = {
  ebay: "eBay",
  whatnot: "Whatnot",
  comc: "COMC",
  personal_website: "Personal Website",
  card_show: "Card Show / In Person",
  facebook: "Facebook Marketplace",
};

export const ALL_PLATFORMS: PlatformId[] = [
  "ebay",
  "whatnot",
  "comc",
  "personal_website",
  "card_show",
  "facebook",
];

export interface FeeLineItem {
  label: string;
  amount: number;
  note?: string;
}

export interface PlatformResult {
  platformId: PlatformId;
  platformName: string;
  grossSalePrice: number;
  feeLines: FeeLineItem[];
  totalFees: number;
  shippingCost: number;
  totalCosts: number;
  netProceeds: number;
  profitDollars: number;
  profitPercent: number | null;
  formulaDescription: string;
}

// ─── eBay ────────────────────────────────────────────────────────────────────

const EBAY_STANDARD_RATE = 0.1325;
const EBAY_TRP_RATE = 0.1235;

export function calcEbay(
  salePrice: number,
  costBasis: number,
  shippingCost: number,
  isTopRated: boolean
): PlatformResult {
  if (salePrice <= 0) return emptyResult("ebay", isTopRated ? "eBay (Top Rated Plus)" : "eBay", costBasis);

  const rate = isTopRated ? EBAY_TRP_RATE : EBAY_STANDARD_RATE;
  const ratePct = isTopRated ? 12.35 : 13.25;

  const fvf = round2(salePrice * rate);
  const totalFees = fvf;
  const totalCosts = round2(totalFees + shippingCost);
  const netProceeds = round2(salePrice - totalCosts);
  const profitDollars = round2(netProceeds - costBasis);
  const profitPercent = costBasis > 0 ? round2((profitDollars / costBasis) * 100) : null;

  return {
    platformId: "ebay",
    platformName: isTopRated ? "eBay (Top Rated Plus)" : "eBay",
    grossSalePrice: salePrice,
    feeLines: [
      {
        label: `Final value fee (${ratePct}%)`,
        amount: fvf,
        note: "Includes payment processing",
      },
    ],
    totalFees,
    shippingCost,
    totalCosts,
    netProceeds,
    profitDollars,
    profitPercent,
    formulaDescription: `Net = Sale Price − (${ratePct}% × Sale Price) − Shipping\n= $${salePrice.toFixed(2)} − $${fvf.toFixed(2)} − $${shippingCost.toFixed(2)} = $${netProceeds.toFixed(2)}`,
  };
}

export function calcEbayBreakEven(
  costBasis: number,
  shippingOut: number,
  isTopRated: boolean
): number {
  const rate = isTopRated ? EBAY_TRP_RATE : EBAY_STANDARD_RATE;
  return round2((costBasis + shippingOut) / (1 - rate));
}

// ─── Whatnot ─────────────────────────────────────────────────────────────────

export function calcWhatnot(
  salePrice: number,
  costBasis: number,
  shippingCost: number
): PlatformResult {
  if (salePrice <= 0) return emptyResult("whatnot", "Whatnot", costBasis);

  const sellerFee = round2(salePrice * 0.08);
  const processingFee = round2(salePrice * 0.029 + 0.30);
  const totalFees = round2(sellerFee + processingFee);
  const totalCosts = round2(totalFees + shippingCost);
  const netProceeds = round2(salePrice - totalCosts);
  const profitDollars = round2(netProceeds - costBasis);
  const profitPercent = costBasis > 0 ? round2((profitDollars / costBasis) * 100) : null;

  return {
    platformId: "whatnot",
    platformName: "Whatnot",
    grossSalePrice: salePrice,
    feeLines: [
      { label: "Seller fee (8%)", amount: sellerFee },
      { label: "Payment processing (2.9% + $0.30)", amount: processingFee },
    ],
    totalFees,
    shippingCost,
    totalCosts,
    netProceeds,
    profitDollars,
    profitPercent,
    formulaDescription: `Net = Sale Price − 8% seller fee − (2.9% + $0.30) processing − Shipping\n= $${salePrice.toFixed(2)} − $${sellerFee.toFixed(2)} − $${processingFee.toFixed(2)} − $${shippingCost.toFixed(2)} = $${netProceeds.toFixed(2)}`,
  };
}

export function calcWhatnotBreakEven(costBasis: number, shippingOut: number): number {
  // salePrice * (1 - 0.08 - 0.029) - 0.30 - shippingOut = costBasis
  return round2((costBasis + shippingOut + 0.30) / (1 - 0.08 - 0.029));
}

// ─── COMC ────────────────────────────────────────────────────────────────────

export function calcCOMC(salePrice: number, costBasis: number): PlatformResult {
  if (salePrice <= 0) return emptyResult("comc", "COMC", costBasis);

  const submissionFee = 1.0;
  const commission = round2(salePrice * 0.1);
  const totalFees = round2(submissionFee + commission);
  const totalCosts = totalFees; // $0 shipping to seller
  const netProceeds = round2(salePrice - totalCosts);
  const profitDollars = round2(netProceeds - costBasis);
  const profitPercent = costBasis > 0 ? round2((profitDollars / costBasis) * 100) : null;

  return {
    platformId: "comc",
    platformName: "COMC",
    grossSalePrice: salePrice,
    feeLines: [
      { label: "Submission fee", amount: submissionFee },
      { label: "Commission (10%)", amount: commission },
    ],
    totalFees,
    shippingCost: 0,
    totalCosts,
    netProceeds,
    profitDollars,
    profitPercent,
    formulaDescription: `Net = Sale Price − $1.00 submission − 10% commission\n= $${salePrice.toFixed(2)} − $1.00 − $${commission.toFixed(2)} = $${netProceeds.toFixed(2)} (shipping: $0 to seller)`,
  };
}

export function calcCOMCBreakEven(costBasis: number): number {
  // salePrice - 1.00 - salePrice * 0.10 = costBasis
  // salePrice * 0.90 = costBasis + 1.00
  return round2((costBasis + 1.0) / 0.9);
}

// ─── Personal Website ─────────────────────────────────────────────────────────

export function calcPersonalWebsite(
  salePrice: number,
  costBasis: number,
  shippingCost: number
): PlatformResult {
  if (salePrice <= 0) return emptyResult("personal_website", "Personal Website", costBasis);

  const processingFee = round2(salePrice * 0.029 + 0.30);
  const totalFees = processingFee;
  const totalCosts = round2(totalFees + shippingCost);
  const netProceeds = round2(salePrice - totalCosts);
  const profitDollars = round2(netProceeds - costBasis);
  const profitPercent = costBasis > 0 ? round2((profitDollars / costBasis) * 100) : null;

  return {
    platformId: "personal_website",
    platformName: "Personal Website",
    grossSalePrice: salePrice,
    feeLines: [
      { label: "Payment processing (2.9% + $0.30)", amount: processingFee, note: "Shopify / Stripe" },
    ],
    totalFees,
    shippingCost,
    totalCosts,
    netProceeds,
    profitDollars,
    profitPercent,
    formulaDescription: `Net = Sale Price − (2.9% + $0.30) processing − Shipping\n= $${salePrice.toFixed(2)} − $${processingFee.toFixed(2)} − $${shippingCost.toFixed(2)} = $${netProceeds.toFixed(2)}`,
  };
}

export function calcPersonalWebsiteBreakEven(costBasis: number, shippingOut: number): number {
  // salePrice * (1 - 0.029) - 0.30 - shippingOut = costBasis
  return round2((costBasis + shippingOut + 0.30) / (1 - 0.029));
}

// ─── Card Show ───────────────────────────────────────────────────────────────

export function calcCardShow(
  salePrice: number,
  costBasis: number,
  tableAmortized: number
): PlatformResult {
  if (salePrice <= 0) return emptyResult("card_show", "Card Show / In Person", costBasis);

  const totalFees = 0;
  const totalCosts = round2(tableAmortized);
  const netProceeds = round2(salePrice - totalCosts);
  const profitDollars = round2(netProceeds - costBasis);
  const profitPercent = costBasis > 0 ? round2((profitDollars / costBasis) * 100) : null;

  const feeLines: FeeLineItem[] =
    tableAmortized > 0
      ? [{ label: "Table cost (amortized per card)", amount: tableAmortized }]
      : [{ label: "No fees", amount: 0 }];

  return {
    platformId: "card_show",
    platformName: "Card Show / In Person",
    grossSalePrice: salePrice,
    feeLines,
    totalFees,
    shippingCost: 0,
    totalCosts,
    netProceeds,
    profitDollars,
    profitPercent,
    formulaDescription:
      tableAmortized > 0
        ? `Net = Sale Price − Table Amortized\n= $${salePrice.toFixed(2)} − $${tableAmortized.toFixed(2)} = $${netProceeds.toFixed(2)}\nTable amortized = Monthly Cost ÷ Cards Per Show`
        : `Net = Sale Price (no fees, no shipping)\n= $${salePrice.toFixed(2)}`,
  };
}

export function calcCardShowBreakEven(costBasis: number, tableAmortized: number): number {
  return round2(costBasis + tableAmortized);
}

// ─── Facebook Marketplace ─────────────────────────────────────────────────────

export function calcFacebook(
  salePrice: number,
  costBasis: number,
  shippingCost: number,
  isShipped: boolean
): PlatformResult {
  if (salePrice <= 0)
    return emptyResult(
      "facebook",
      isShipped ? "Facebook Marketplace (Shipped)" : "Facebook Marketplace (Local)",
      costBasis
    );

  const fee = isShipped ? round2(salePrice * 0.05) : 0;
  const shipping = isShipped ? shippingCost : 0;
  const totalFees = fee;
  const totalCosts = round2(fee + shipping);
  const netProceeds = round2(salePrice - totalCosts);
  const profitDollars = round2(netProceeds - costBasis);
  const profitPercent = costBasis > 0 ? round2((profitDollars / costBasis) * 100) : null;

  const feeLines: FeeLineItem[] =
    fee > 0
      ? [{ label: "Marketplace fee (5% shipped)", amount: fee }]
      : [{ label: "No fees (cash / local pickup)", amount: 0 }];

  return {
    platformId: "facebook",
    platformName: isShipped ? "Facebook Marketplace (Shipped)" : "Facebook Marketplace (Local)",
    grossSalePrice: salePrice,
    feeLines,
    totalFees,
    shippingCost: shipping,
    totalCosts,
    netProceeds,
    profitDollars,
    profitPercent,
    formulaDescription: isShipped
      ? `Net = Sale Price − 5% fee − Shipping\n= $${salePrice.toFixed(2)} − $${fee.toFixed(2)} − $${shipping.toFixed(2)} = $${netProceeds.toFixed(2)}`
      : `Net = Sale Price (no fees, cash only)\n= $${salePrice.toFixed(2)}`,
  };
}

export function calcFacebookBreakEven(
  costBasis: number,
  shippingOut: number,
  isShipped: boolean
): number {
  if (!isShipped) return costBasis;
  // salePrice * (1 - 0.05) - shippingOut = costBasis
  return round2((costBasis + shippingOut) / 0.95);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function emptyResult(
  platformId: PlatformId,
  platformName: string,
  costBasis: number
): PlatformResult {
  return {
    platformId,
    platformName,
    grossSalePrice: 0,
    feeLines: [],
    totalFees: 0,
    shippingCost: 0,
    totalCosts: 0,
    netProceeds: 0,
    profitDollars: round2(-costBasis),
    profitPercent: costBasis > 0 ? -100 : null,
    formulaDescription: "",
  };
}

export function fmt$(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  return `${sign}$${abs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
