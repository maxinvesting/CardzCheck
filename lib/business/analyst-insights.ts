import type { BusinessInventoryItem } from "@/types";

export interface BusinessAnalystInsights {
  listingOpportunities: string[];
  inventoryRisks: string[];
  profitSignals: string[];
  behavioralObservations: string[];
  summary: {
    unlistedActiveCount: number;
    riskSignalCount: number;
  };
  coverage: {
    totalItems: number;
    activeItems: number;
    cmvCoveragePct: number;
    listCoveragePct: number;
  };
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const STALE_ACTIVE_DAYS = 90;
const CONCENTRATION_ALERT_THRESHOLD = 0.55;

function currency(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

function percent(value: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((value / total) * 100);
}

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return count === 1 ? singular : plural;
}

function channelLabel(channel: BusinessInventoryItem["channel"]): string {
  switch (channel) {
    case "ebay":
      return "eBay";
    case "whatnot":
      return "Whatnot";
    case "instagram":
      return "Instagram";
    default:
      return channel.charAt(0).toUpperCase() + channel.slice(1);
  }
}

function isWax(item: BusinessInventoryItem): boolean {
  return item.notes?.includes("[WAX]") ?? false;
}

type ProfitCandidate = {
  title: string;
  spreadCents: number;
  basis: "LIST" | "CMV";
};

export function generateBusinessAnalystInsights(
  items: BusinessInventoryItem[],
  now: Date = new Date()
): BusinessAnalystInsights {
  if (items.length === 0) {
    return {
      listingOpportunities: [
        "Opportunity: No inventory rows yet. Add inventory to generate listing signals.",
      ],
      inventoryRisks: [
        "Observation: Risk signals are unavailable until acquisition, pricing, and CMV fields are populated.",
      ],
      profitSignals: [
        "Profit estimates unavailable — missing inventory and pricing inputs.",
      ],
      behavioralObservations: [
        "Observation: Behavioral signals will appear once inventory activity is recorded.",
      ],
      summary: {
        unlistedActiveCount: 0,
        riskSignalCount: 0,
      },
      coverage: {
        totalItems: 0,
        activeItems: 0,
        cmvCoveragePct: 0,
        listCoveragePct: 0,
      },
    };
  }

  const activeItems = items.filter(
    (item) => item.status !== "sold" && item.status !== "returned"
  );

  const listedCount = activeItems.filter((item) => item.status === "listed").length;
  const unlistedCount = activeItems.filter((item) => item.status === "unlisted").length;
  const pendingSaleCount = activeItems.filter((item) => item.status === "pending_sale").length;
  const soldCount = items.filter((item) => item.status === "sold").length;

  const cmvItems = activeItems.filter(
    (item) => item.current_market_value_cents != null && item.current_market_value_cents > 0
  );
  const listedWithPrice = activeItems.filter(
    (item) => item.list_price_cents != null && item.list_price_cents > 0
  );

  const cmvCoveragePct = percent(cmvItems.length, activeItems.length);
  const listCoveragePct = percent(listedWithPrice.length, activeItems.length);

  const listingOpportunities: string[] = [];
  if (unlistedCount > 0) {
    listingOpportunities.push(
      `Opportunity: ${unlistedCount} active ${pluralize(unlistedCount, "item")} currently unlisted.`
    );
  }

  const listedMissingPriceCount = activeItems.filter(
    (item) =>
      item.status === "listed" &&
      (item.list_price_cents == null || item.list_price_cents <= 0)
  ).length;

  if (listedMissingPriceCount > 0) {
    listingOpportunities.push(
      `Opportunity: LIST price missing on ${listedMissingPriceCount} listed ${pluralize(listedMissingPriceCount, "item")} — estimated profit signal unavailable.`
    );
  }

  if (pendingSaleCount > 0) {
    listingOpportunities.push(
      `Observation: ${pendingSaleCount} ${pluralize(pendingSaleCount, "item")} in pending sale status; reconcile to sold/returned to keep inventory flow clean.`
    );
  }

  if (listingOpportunities.length === 0) {
    listingOpportunities.push(
      "Signal: Active inventory has no immediate listing coverage gaps."
    );
  }

  const inventoryRisks: string[] = [];
  const activeMissingCmvCount = activeItems.length - cmvItems.length;
  if (activeMissingCmvCount > 0) {
    inventoryRisks.push(
      `Risk: No comps / CMV available for ${activeMissingCmvCount} active ${pluralize(activeMissingCmvCount, "item")}.`
    );
  }

  let staleActiveCount = 0;
  let missingAcquisitionDateCount = 0;
  for (const item of activeItems) {
    if (!item.acquisition_date) {
      missingAcquisitionDateCount += 1;
      continue;
    }
    const acquiredMs = Date.parse(item.acquisition_date);
    if (Number.isNaN(acquiredMs)) {
      missingAcquisitionDateCount += 1;
      continue;
    }
    const ageDays = Math.floor((now.getTime() - acquiredMs) / MS_PER_DAY);
    if (ageDays >= STALE_ACTIVE_DAYS) staleActiveCount += 1;
  }

  if (staleActiveCount > 0) {
    inventoryRisks.push(
      `Risk: ${staleActiveCount} active ${pluralize(staleActiveCount, "item")} aged ${STALE_ACTIVE_DAYS}+ days.`
    );
  }

  if (missingAcquisitionDateCount > 0) {
    inventoryRisks.push(
      `Observation: Aging signal partially unavailable — ${missingAcquisitionDateCount} active ${pluralize(missingAcquisitionDateCount, "item")} missing acquisition date.`
    );
  }

  let totalTrackedValueCents = 0;
  let waxTrackedValueCents = 0;
  for (const item of activeItems) {
    const qty = item.quantity || 1;
    const cmvValue =
      item.current_market_value_cents != null && item.current_market_value_cents > 0
        ? item.current_market_value_cents * qty
        : null;
    const lineValue = cmvValue ?? Math.max(item.cost_basis_total_cents || 0, 0);
    totalTrackedValueCents += lineValue;
    if (isWax(item)) waxTrackedValueCents += lineValue;
  }

  if (totalTrackedValueCents > 0) {
    const waxShare = waxTrackedValueCents / totalTrackedValueCents;
    const cardsShare = 1 - waxShare;
    const dominantLabel = waxShare >= cardsShare ? "Wax" : "Cards";
    const dominantShare = Math.max(waxShare, cardsShare);
    if (dominantShare >= CONCENTRATION_ALERT_THRESHOLD) {
      inventoryRisks.push(
        `Risk: Inventory value concentrated in ${dominantLabel} (${Math.round(
          dominantShare * 100
        )}%).`
      );
    }
  }

  if (inventoryRisks.length === 0) {
    inventoryRisks.push(
      "Signal: No immediate concentration, coverage, or aging risk detected."
    );
  }

  const profitSignals: string[] = [];
  const candidates: ProfitCandidate[] = [];
  let activeItemsWithEstimates = 0;
  for (const item of activeItems) {
    const cost = item.cost_basis_total_cents || 0;
    if (cost <= 0) continue;

    const listPrice = item.list_price_cents ?? 0;
    const qty = item.quantity || 1;
    const cmv = item.current_market_value_cents ?? 0;

    if (listPrice > 0) {
      candidates.push({
        title: item.title,
        spreadCents: listPrice - cost,
        basis: "LIST",
      });
      activeItemsWithEstimates += 1;
      continue;
    }

    if (cmv > 0) {
      candidates.push({
        title: item.title,
        spreadCents: cmv * qty - cost,
        basis: "CMV",
      });
      activeItemsWithEstimates += 1;
    }
  }

  if (candidates.length > 0) {
    const highest = candidates.reduce((best, candidate) =>
      candidate.spreadCents > best.spreadCents ? candidate : best
    );
    profitSignals.push(
      `Signal: Highest estimated profit potential is ${highest.title} (${currency(
        highest.spreadCents
      )} using ${highest.basis} basis).`
    );

    const positiveCount = candidates.filter((candidate) => candidate.spreadCents > 0).length;
    profitSignals.push(
      `Signal: ${positiveCount} of ${candidates.length} estimated active ${pluralize(
        candidates.length,
        "position"
      )} show positive spread.`
    );
  }

  const missingEstimateCount = Math.max(activeItems.length - activeItemsWithEstimates, 0);
  if (missingEstimateCount > 0) {
    if (missingEstimateCount === activeItems.length) {
      profitSignals.push(
        "Profit estimates unavailable — missing LIST price and CMV coverage on active inventory."
      );
    } else {
      profitSignals.push(
        `Observation: Profit estimate coverage is partial — ${missingEstimateCount} active ${pluralize(
          missingEstimateCount,
          "item"
        )} missing LIST price/CMV basis.`
      );
    }
  }

  if (profitSignals.length === 0) {
    profitSignals.push(
      "Profit estimates unavailable — missing cost basis plus LIST or CMV fields."
    );
  }

  const behavioralObservations: string[] = [];
  const waxCount = activeItems.filter(isWax).length;
  const cardsCount = activeItems.length - waxCount;
  if (activeItems.length > 0) {
    behavioralObservations.push(
      `Observation: Category mix is ${percent(cardsCount, activeItems.length)}% cards / ${percent(
        waxCount,
        activeItems.length
      )}% wax.`
    );
  }

  const channelCounts = new Map<BusinessInventoryItem["channel"], number>();
  for (const item of activeItems) {
    channelCounts.set(item.channel, (channelCounts.get(item.channel) || 0) + 1);
  }
  if (channelCounts.size > 0 && activeItems.length > 0) {
    const [topChannel, topCount] = Array.from(channelCounts.entries()).reduce(
      (best, entry) => (entry[1] > best[1] ? entry : best)
    );
    behavioralObservations.push(
      `Observation: Primary channel is ${channelLabel(topChannel)} (${percent(
        topCount,
        activeItems.length
      )}% of active inventory).`
    );
  }

  if (soldCount > 0) {
    behavioralObservations.push(
      `Observation: ${soldCount} ${pluralize(soldCount, "item")} marked sold (${percent(
        soldCount,
        items.length
      )}% of total inventory).`
    );
  }

  if (behavioralObservations.length === 0) {
    behavioralObservations.push(
      "Observation: Behavioral signals are limited until channel and status activity increases."
    );
  }

  return {
    listingOpportunities: listingOpportunities.slice(0, 3),
    inventoryRisks: inventoryRisks.slice(0, 3),
    profitSignals: profitSignals.slice(0, 3),
    behavioralObservations: behavioralObservations.slice(0, 3),
    summary: {
      unlistedActiveCount: unlistedCount,
      riskSignalCount: inventoryRisks.filter((signal) => signal.startsWith("Risk:"))
        .length,
    },
    coverage: {
      totalItems: items.length,
      activeItems: activeItems.length,
      cmvCoveragePct,
      listCoveragePct,
    },
  };
}
