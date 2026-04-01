/**
 * EbayProfitEngine.ts
 *
 * Pure profit calculator for selling trading cards on eBay via
 * Standard Envelope (ESE). Covers the 2026 eBay fee structure.
 *
 * Key design decisions:
 *  - All monetary values are in USD (floating-point dollars).
 *  - The core calculator is a pure, deterministic function with no side effects.
 *  - Intermediate values are rounded to the nearest cent ($0.01) to mirror
 *    how eBay actually applies fees in their seller payout statements.
 *  - "Net profit" is defined as:
 *      itemPrice − finalValueFee − perOrderFee − shippingPostage − packagingTotal
 *
 * ESE shipping model assumption:
 *  eBay calculates FVF on the total order amount, which includes item price,
 *  shipping, and collected sales tax. For ESE listings (including those with
 *  free shipping), eBay includes the applicable shipping rate in the FVF base.
 *  Shipping is treated as a seller cost rather than net revenue; the net
 *  formula reflects the seller's take-home from the item price alone.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Maximum item value permitted on an eBay Standard Envelope listing.
 * eBay will not insure or approve ESE for higher-value cards.
 */
export const ESE_MAX_ITEM_VALUE = 20.0;

/**
 * USPS postage cost per weight tier for eBay Standard Envelope (2026).
 * ESE is restricted to 1–3 oz.
 */
export const ESE_SHIPPING_RATES = {
  1: 0.74,
  2: 1.03,
  3: 1.32,
} as const satisfies Record<1 | 2 | 3, number>;

/**
 * eBay Final Value Fee rates for the 2026 fee schedule.
 *
 * FVF is applied to the TOTAL transaction amount:
 *   itemPrice + shippingCharged + estimatedSalesTax
 *
 * Store tiers:
 *   none / starter  →  13.25 %
 *   basic and above →  12.35 %
 *   international buyers add an extra 1.65 % surcharge on top of the base rate.
 */
export const FVF_RATES = {
  /** Non-Store or Starter Store subscribers. */
  NON_STORE: 0.1325,
  /** Basic Store or higher subscribers. */
  BASIC_PLUS: 0.1235,
  /** Surcharge added when the buyer's delivery address is outside the US. */
  INTERNATIONAL_SURCHARGE: 0.0165,
} as const;

/**
 * eBay per-order fixed processing fees (2026).
 *
 * Applied once per order in addition to the FVF percentage.
 * The tier is determined by the item price alone (pre-shipping, pre-tax).
 */
export const PER_ORDER_FEES = {
  /** Item price is at or below this threshold → $0.30 fixed fee. */
  THRESHOLD: 10.0,
  /** Fee when itemPrice <= THRESHOLD. */
  LOW: 0.3,
  /** Fee when itemPrice > THRESHOLD. */
  HIGH: 0.4,
} as const;

/**
 * Default packaging material costs for a standard ESE mailing.
 * Sum: $0.25.
 *
 * Any component can be overridden via SaleInputs.packagingCosts.
 */
export const DEFAULT_PACKAGING_COSTS: PackagingCosts = {
  pennySleeve: 0.01,
  toploader: 0.15,
  teamBag: 0.02,
  envelope: 0.03,
  label: 0.04,
};

/** Pre-computed sum of all default packaging components ($0.25). */
export const DEFAULT_PACKAGING_TOTAL: number = Object.values(
  DEFAULT_PACKAGING_COSTS
).reduce((sum, c) => sum + c, 0);

// ─────────────────────────────────────────────────────────────────────────────
// Interfaces & Types
// ─────────────────────────────────────────────────────────────────────────────

/** eBay store subscription tiers that affect the FVF rate. */
export type StoreTier =
  | "none"
  | "starter"
  | "basic"
  | "premium"
  | "anchor"
  | "enterprise";

/** Individual packaging component costs in USD. */
export interface PackagingCosts {
  /** Soft sleeve placed directly on card. */
  pennySleeve: number;
  /** Rigid 3"×4" top-loading holder. */
  toploader: number;
  /** Resealable polybag that holds the toploaded card. */
  teamBag: number;
  /** Mailing envelope. */
  envelope: number;
  /** Printed shipping label. */
  label: number;
}

/** All inputs required to compute net profit for an eBay ESE sale. */
export interface SaleInputs {
  /**
   * Listed item price in USD.
   * Must be > 0 and ≤ ESE_MAX_ITEM_VALUE ($20.00).
   */
  itemPrice: number;

  /**
   * Card weight for ESE postage selection (1, 2, or 3 oz).
   * A single raw card in a penny sleeve + toploader typically weighs ~1 oz.
   */
  weightOz: 1 | 2 | 3;

  /**
   * eBay store subscription tier.
   * Determines which FVF rate is applied.
   * @default 'none'
   */
  storeTier?: StoreTier;

  /**
   * Whether the winning buyer's delivery address is international (non-US).
   * Adds a 1.65 % surcharge to the FVF rate.
   * @default false
   */
  isInternational?: boolean;

  /**
   * Estimated sales tax rate as a decimal (e.g. 0.075 for 7.5 %).
   * eBay collects and remits marketplace facilitator tax in most US states.
   * The tax is included in the FVF base even though the seller never pockets it.
   * @default 0.075
   */
  salesTaxRate?: number;

  /**
   * Override specific packaging cost components (USD).
   * Omitted fields fall back to DEFAULT_PACKAGING_COSTS values.
   */
  packagingCosts?: Partial<PackagingCosts>;
}

/** Full fee and profit breakdown returned by calculateNetProfit(). */
export interface ProfitBreakdown {
  // ── Echoed inputs ────────────────────────────────────────────────────────
  itemPrice: number;
  weightOz: 1 | 2 | 3;
  storeTier: StoreTier;
  isInternational: boolean;
  salesTaxRate: number;

  // ── Shipping ─────────────────────────────────────────────────────────────
  /** USPS ESE postage cost in USD for the selected weight tier. */
  shippingCost: number;

  // ── Packaging ────────────────────────────────────────────────────────────
  /** Resolved per-component packaging costs (merged defaults + overrides). */
  packagingCosts: PackagingCosts;
  /** Sum of all packaging components in USD. */
  packagingTotal: number;

  // ── eBay fees ────────────────────────────────────────────────────────────
  /**
   * Dollar amount eBay uses as the FVF calculation base (rounded to cents).
   * Formula: (itemPrice + shippingCost) × (1 + salesTaxRate)
   */
  fvfBase: number;
  /**
   * Effective FVF rate applied as a decimal.
   * Includes the international surcharge when applicable.
   */
  fvfRate: number;
  /**
   * eBay Final Value Fee in USD (rounded to cents).
   * This is the percentage-based portion of eBay's cut.
   */
  finalValueFee: number;
  /**
   * eBay per-order processing fee in USD.
   * $0.30 when itemPrice ≤ $10.00; $0.40 when itemPrice > $10.00.
   */
  perOrderFee: number;
  /** Combined eBay fees: finalValueFee + perOrderFee. */
  totalEbayFees: number;

  // ── Summary ──────────────────────────────────────────────────────────────
  /** Grand total of all seller costs: eBay fees + shipping postage + packaging. */
  totalCosts: number;
  /**
   * Net profit in USD (positive = gain, negative = loss).
   *
   * Formula: itemPrice − totalEbayFees − shippingCost − packagingTotal
   *
   * Rationale: shipping charged to the buyer equals the postage cost (ESE
   * rate), so the two cancel out. Net profit is therefore driven entirely
   * by the item price minus all fees and material costs.
   */
  netProfit: number;
  /**
   * Net profit expressed as a percentage of the item price.
   * Useful for quickly comparing margin across different price points.
   */
  netMarginPct: number;
  /** Convenience flag: true when the sale results in a financial loss. */
  isLoss: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Error class
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Thrown when the caller provides inputs that violate ESE listing rules
 * or are otherwise invalid (e.g. a $25 card, a negative price, NaN).
 */
export class EseValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EseValidationError";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Private helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Round a floating-point dollar amount to the nearest cent.
 * Uses "round half away from zero" (standard Math.round behaviour).
 */
function roundCents(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Resolve the effective FVF rate for the given store tier.
 * Basic Store and higher receive the discounted rate; everything else pays full.
 */
function resolveFvfRate(storeTier: StoreTier, isInternational: boolean): number {
  const baseRate =
    storeTier === "none" || storeTier === "starter"
      ? FVF_RATES.NON_STORE
      : FVF_RATES.BASIC_PLUS;

  return baseRate + (isInternational ? FVF_RATES.INTERNATIONAL_SURCHARGE : 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// Core calculator
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calculate the true net profit for selling a single trading card on eBay
 * via Standard Envelope (ESE).
 *
 * @param inputs  Sale parameters — see SaleInputs for full documentation.
 * @returns       A complete fee and profit breakdown — see ProfitBreakdown.
 *
 * @throws {EseValidationError}
 *   - If itemPrice is not a finite positive number.
 *   - If itemPrice exceeds the ESE maximum ($20.00).
 *   - If salesTaxRate is negative or non-finite.
 *
 * @example
 *   const result = calculateNetProfit({ itemPrice: 5.00, weightOz: 1 });
 *   console.log(result.netProfit);  // ~2.89
 *   console.log(result.isLoss);     // false
 */
export function calculateNetProfit(inputs: SaleInputs): ProfitBreakdown {
  // ── Destructure with defaults ─────────────────────────────────────────────
  const {
    itemPrice,
    weightOz,
    storeTier = "none",
    isInternational = false,
    salesTaxRate = 0.075,
    packagingCosts: packagingOverrides = {},
  } = inputs;

  // ── Input validation ──────────────────────────────────────────────────────

  if (!Number.isFinite(itemPrice) || itemPrice <= 0) {
    throw new EseValidationError(
      `itemPrice must be a positive finite number (got ${itemPrice}).`
    );
  }

  if (itemPrice > ESE_MAX_ITEM_VALUE) {
    throw new EseValidationError(
      `eBay Standard Envelope is only permitted for items valued at ` +
        `$${ESE_MAX_ITEM_VALUE.toFixed(2)} or less. ` +
        `Received: $${itemPrice.toFixed(2)}. ` +
        `Use standard shipping for higher-value cards.`
    );
  }

  if (!Number.isFinite(salesTaxRate) || salesTaxRate < 0) {
    throw new EseValidationError(
      `salesTaxRate must be a non-negative finite number (got ${salesTaxRate}).`
    );
  }

  // ── Shipping postage cost ─────────────────────────────────────────────────

  const shippingCost: number = ESE_SHIPPING_RATES[weightOz];

  // ── Packaging costs ───────────────────────────────────────────────────────

  // Merge caller overrides with defaults (override wins for each key).
  const resolvedPackaging: PackagingCosts = {
    pennySleeve:
      packagingOverrides.pennySleeve ?? DEFAULT_PACKAGING_COSTS.pennySleeve,
    toploader:
      packagingOverrides.toploader ?? DEFAULT_PACKAGING_COSTS.toploader,
    teamBag: packagingOverrides.teamBag ?? DEFAULT_PACKAGING_COSTS.teamBag,
    envelope: packagingOverrides.envelope ?? DEFAULT_PACKAGING_COSTS.envelope,
    label: packagingOverrides.label ?? DEFAULT_PACKAGING_COSTS.label,
  };

  const packagingTotal: number = roundCents(
    Object.values(resolvedPackaging).reduce((sum, cost) => sum + cost, 0)
  );

  // ── eBay Final Value Fee ──────────────────────────────────────────────────
  //
  // eBay charges FVF on the TOTAL order amount:
  //   (itemPrice + shipping) × (1 + salesTaxRate)
  //
  // Even for "free shipping" listings, eBay's system includes the shipping
  // component in the FVF base using the applicable postage rate.
  //
  // Both the base and the resulting fee are rounded to cents independently
  // to match eBay's internal rounding behaviour.

  const fvfBase: number = roundCents(
    (itemPrice + shippingCost) * (1 + salesTaxRate)
  );

  const fvfRate: number = resolveFvfRate(storeTier, isInternational);

  const finalValueFee: number = roundCents(fvfBase * fvfRate);

  // ── Per-order processing fee ──────────────────────────────────────────────
  //
  // eBay's spec defines this threshold using the item price alone
  // (before shipping and tax), so $10.00 exactly falls in the $0.30 tier.

  const perOrderFee: number =
    itemPrice <= PER_ORDER_FEES.THRESHOLD
      ? PER_ORDER_FEES.LOW
      : PER_ORDER_FEES.HIGH;

  // ── Totals ────────────────────────────────────────────────────────────────

  const totalEbayFees: number = roundCents(finalValueFee + perOrderFee);

  // All out-of-pocket costs the seller bears: eBay fees + postage + materials.
  const totalCosts: number = roundCents(
    totalEbayFees + shippingCost + packagingTotal
  );

  // Net profit = what the seller earns from the item price minus every cost.
  //
  // Note on shipping: if the seller charges the buyer for shipping (e.g. $0.74
  // for 1 oz ESE), that income exactly offsets the postage cost — a wash. If
  // the seller offers free shipping, the postage is a pure cost. Either way,
  // the net result is the same: itemPrice − all_costs.
  const netProfit: number = roundCents(itemPrice - totalCosts);

  // Margin as a percentage of the item price (can be negative).
  const netMarginPct: number = roundCents((netProfit / itemPrice) * 100);

  // ── Return full breakdown ─────────────────────────────────────────────────

  return {
    // Echoed inputs
    itemPrice,
    weightOz,
    storeTier,
    isInternational,
    salesTaxRate,
    // Shipping
    shippingCost,
    // Packaging
    packagingCosts: resolvedPackaging,
    packagingTotal,
    // eBay fees
    fvfBase,
    fvfRate,
    finalValueFee,
    perOrderFee,
    totalEbayFees,
    // Summary
    totalCosts,
    netProfit,
    netMarginPct,
    isLoss: netProfit < 0,
  };
}

