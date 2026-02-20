import type {
  BusinessInventoryItem,
  BusinessMetrics,
  BusinessSale,
} from "@/types";

export interface BusinessConsultantContext {
  generated_at: string;
  assumptions: {
    current_market_value_cents_is_per_unit: boolean;
    list_price_cents_interpretation: "line_level";
  };
  inventory_summary: {
    total_items: number;
    active_items: number;
    listed_active_items: number;
    unlisted_active_items: number;
    pending_sale_active_items: number;
    sold_items: number;
    returned_items: number;
    total_active_cost_basis_cents: number;
    total_active_list_value_cents: number;
    total_active_cmv_value_cents: number;
    cmv_coverage_pct: number;
    list_coverage_pct: number;
    missing_acquisition_date_active_count: number;
    aged_90d_plus_active_count: number;
  };
  category_distribution: {
    cards_count: number;
    wax_count: number;
    cards_value_cents: number;
    wax_value_cents: number;
  };
  channel_distribution: Array<{
    channel: string;
    active_count: number;
    active_value_cents: number;
  }>;
  pricing_coverage: {
    active_missing_cmv_count: number;
    active_missing_list_price_count: number;
    active_missing_cost_basis_count: number;
  };
  profitability_candidates: Array<{
    title: string;
    status: BusinessInventoryItem["status"];
    channel: BusinessInventoryItem["channel"];
    cost_basis_total_cents: number;
    list_price_cents: number | null;
    current_market_value_cents: number | null;
    estimated_spread_cents: number | null;
    spread_basis: "LIST" | "CMV" | "none";
  }>;
  sales_summary: {
    total_sales: number;
    revenue_cents: number;
    net_proceeds_cents: number;
    profit_cents: number;
    average_margin_pct: number | null;
    fee_burden_pct: number | null;
    shipping_impact_cents: number;
    low_margin_sales_count: number;
    negative_profit_sales_count: number;
  };
  recent_sales: Array<{
    sale_date: string;
    sale_price_cents: number;
    platform_fees_cents: number;
    shipping_paid_cents: number;
    shipping_charged_cents: number;
    profit_cents: number;
    net_proceeds_cents: number;
  }>;
  business_metrics: BusinessMetrics;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function roundPct(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 100);
}

function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

function isWax(item: BusinessInventoryItem): boolean {
  return item.notes?.includes("[WAX]") ?? false;
}

function lineCmvCents(item: BusinessInventoryItem): number | null {
  if (
    item.current_market_value_cents == null ||
    item.current_market_value_cents <= 0
  ) {
    return null;
  }
  return item.current_market_value_cents * (item.quantity || 1);
}

function lineTrackedValueCents(item: BusinessInventoryItem): number {
  const cmv = lineCmvCents(item);
  if (cmv != null) return cmv;
  return Math.max(item.cost_basis_total_cents || 0, 0);
}

export function buildBusinessConsultantContext(args: {
  inventory: BusinessInventoryItem[];
  sales: BusinessSale[];
  metrics: BusinessMetrics;
  now?: Date;
}): BusinessConsultantContext {
  const { inventory, sales, metrics, now = new Date() } = args;

  const activeInventory = inventory.filter(
    (item) => item.status !== "sold" && item.status !== "returned"
  );

  const listedActiveItems = activeInventory.filter(
    (item) => item.status === "listed"
  ).length;
  const unlistedActiveItems = activeInventory.filter(
    (item) => item.status === "unlisted"
  ).length;
  const pendingSaleActiveItems = activeInventory.filter(
    (item) => item.status === "pending_sale"
  ).length;
  const soldItems = inventory.filter((item) => item.status === "sold").length;
  const returnedItems = inventory.filter(
    (item) => item.status === "returned"
  ).length;

  const activeWithCmv = activeInventory.filter(
    (item) => item.current_market_value_cents != null && item.current_market_value_cents > 0
  );
  const activeWithList = activeInventory.filter(
    (item) => item.list_price_cents != null && item.list_price_cents > 0
  );

  let totalActiveCostBasisCents = 0;
  let totalActiveListValueCents = 0;
  let totalActiveCmvValueCents = 0;
  let missingAcquisitionDateActiveCount = 0;
  let aged90dPlusActiveCount = 0;

  let cardsCount = 0;
  let waxCount = 0;
  let cardsValueCents = 0;
  let waxValueCents = 0;

  const channelMap = new Map<string, { active_count: number; active_value_cents: number }>();

  for (const item of activeInventory) {
    totalActiveCostBasisCents += item.cost_basis_total_cents || 0;
    totalActiveListValueCents += item.list_price_cents || 0;
    totalActiveCmvValueCents += lineCmvCents(item) || 0;

    if (!item.acquisition_date) {
      missingAcquisitionDateActiveCount += 1;
    } else {
      const acquiredMs = Date.parse(item.acquisition_date);
      if (Number.isNaN(acquiredMs)) {
        missingAcquisitionDateActiveCount += 1;
      } else {
        const ageDays = Math.floor((now.getTime() - acquiredMs) / MS_PER_DAY);
        if (ageDays >= 90) aged90dPlusActiveCount += 1;
      }
    }

    const wax = isWax(item);
    const lineValue = lineTrackedValueCents(item);
    if (wax) {
      waxCount += 1;
      waxValueCents += lineValue;
    } else {
      cardsCount += 1;
      cardsValueCents += lineValue;
    }

    const channelKey = item.channel || "other";
    const current = channelMap.get(channelKey) || {
      active_count: 0,
      active_value_cents: 0,
    };
    current.active_count += 1;
    current.active_value_cents += lineValue;
    channelMap.set(channelKey, current);
  }

  const activeMissingCmvCount = activeInventory.length - activeWithCmv.length;
  const activeMissingListPriceCount = activeInventory.filter(
    (item) => item.list_price_cents == null || item.list_price_cents <= 0
  ).length;
  const activeMissingCostBasisCount = activeInventory.filter(
    (item) => (item.cost_basis_total_cents || 0) <= 0
  ).length;

  const profitabilityCandidates = activeInventory
    .map((item) => {
      const cost = item.cost_basis_total_cents || 0;
      const cmvLine = lineCmvCents(item);
      const list = item.list_price_cents;
      if (list != null && list > 0 && cost > 0) {
        return {
          title: item.title,
          status: item.status,
          channel: item.channel,
          cost_basis_total_cents: cost,
          list_price_cents: list,
          current_market_value_cents: item.current_market_value_cents,
          estimated_spread_cents: list - cost,
          spread_basis: "LIST" as const,
        };
      }
      if (cmvLine != null && cost > 0) {
        return {
          title: item.title,
          status: item.status,
          channel: item.channel,
          cost_basis_total_cents: cost,
          list_price_cents: list ?? null,
          current_market_value_cents: item.current_market_value_cents,
          estimated_spread_cents: cmvLine - cost,
          spread_basis: "CMV" as const,
        };
      }
      return {
        title: item.title,
        status: item.status,
        channel: item.channel,
        cost_basis_total_cents: cost,
        list_price_cents: list ?? null,
        current_market_value_cents: item.current_market_value_cents,
        estimated_spread_cents: null,
        spread_basis: "none" as const,
      };
    })
    .sort((a, b) => {
      const aSpread = a.estimated_spread_cents;
      const bSpread = b.estimated_spread_cents;
      if (aSpread == null && bSpread == null) return 0;
      if (aSpread == null) return 1;
      if (bSpread == null) return -1;
      return bSpread - aSpread;
    })
    .slice(0, 12);

  const revenueCents = sales.reduce((acc, sale) => acc + sale.sale_price_cents, 0);
  const netProceedsCents = sales.reduce(
    (acc, sale) => acc + sale.net_proceeds_cents,
    0
  );
  const profitCents = sales.reduce((acc, sale) => acc + sale.profit_cents, 0);
  const platformFeesCents = sales.reduce(
    (acc, sale) => acc + sale.platform_fees_cents,
    0
  );
  const shippingImpactCents = sales.reduce(
    (acc, sale) => acc + sale.shipping_paid_cents - sale.shipping_charged_cents,
    0
  );
  const lowMarginSalesCount = sales.filter((sale) => {
    if (sale.sale_price_cents <= 0) return false;
    return sale.profit_cents / sale.sale_price_cents < 0.1;
  }).length;
  const negativeProfitSalesCount = sales.filter(
    (sale) => sale.profit_cents < 0
  ).length;

  return {
    generated_at: now.toISOString(),
    assumptions: {
      current_market_value_cents_is_per_unit: true,
      list_price_cents_interpretation: "line_level",
    },
    inventory_summary: {
      total_items: inventory.length,
      active_items: activeInventory.length,
      listed_active_items: listedActiveItems,
      unlisted_active_items: unlistedActiveItems,
      pending_sale_active_items: pendingSaleActiveItems,
      sold_items: soldItems,
      returned_items: returnedItems,
      total_active_cost_basis_cents: totalActiveCostBasisCents,
      total_active_list_value_cents: totalActiveListValueCents,
      total_active_cmv_value_cents: totalActiveCmvValueCents,
      cmv_coverage_pct: roundPct(activeWithCmv.length, activeInventory.length),
      list_coverage_pct: roundPct(activeWithList.length, activeInventory.length),
      missing_acquisition_date_active_count: missingAcquisitionDateActiveCount,
      aged_90d_plus_active_count: aged90dPlusActiveCount,
    },
    category_distribution: {
      cards_count: cardsCount,
      wax_count: waxCount,
      cards_value_cents: cardsValueCents,
      wax_value_cents: waxValueCents,
    },
    channel_distribution: Array.from(channelMap.entries())
      .map(([channel, values]) => ({
        channel,
        active_count: values.active_count,
        active_value_cents: values.active_value_cents,
      }))
      .sort((a, b) => b.active_count - a.active_count),
    pricing_coverage: {
      active_missing_cmv_count: activeMissingCmvCount,
      active_missing_list_price_count: activeMissingListPriceCount,
      active_missing_cost_basis_count: activeMissingCostBasisCount,
    },
    profitability_candidates: profitabilityCandidates,
    sales_summary: {
      total_sales: sales.length,
      revenue_cents: revenueCents,
      net_proceeds_cents: netProceedsCents,
      profit_cents: profitCents,
      average_margin_pct:
        revenueCents > 0 ? roundToOneDecimal((profitCents / revenueCents) * 100) : null,
      fee_burden_pct:
        revenueCents > 0
          ? roundToOneDecimal((platformFeesCents / revenueCents) * 100)
          : null,
      shipping_impact_cents: shippingImpactCents,
      low_margin_sales_count: lowMarginSalesCount,
      negative_profit_sales_count: negativeProfitSalesCount,
    },
    recent_sales: sales.slice(0, 20).map((sale) => ({
      sale_date: sale.sale_date,
      sale_price_cents: sale.sale_price_cents,
      platform_fees_cents: sale.platform_fees_cents,
      shipping_paid_cents: sale.shipping_paid_cents,
      shipping_charged_cents: sale.shipping_charged_cents,
      profit_cents: sale.profit_cents,
      net_proceeds_cents: sale.net_proceeds_cents,
    })),
    business_metrics: metrics,
  };
}
