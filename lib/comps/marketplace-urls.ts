/**
 * Build pre-populated search URLs for every major sports card marketplace.
 * Used to let collectors quickly cross-reference comps across platforms.
 */

export interface CardSearchParams {
  playerName: string;
  year?: string | null;
  setName?: string | null;
  grade?: string | null;
  gradingCompany?: string | null;
  parallelType?: string | null;
  insert?: string | null;
}

export type MarketplaceType = "sold" | "active" | "auction" | "price-guide";

export interface MarketplaceLink {
  id: string;
  name: string;
  tagline: string;
  type: MarketplaceType;
  url: string;
  accentColor: string;
}

/** Builds the best query string for a given card, with optional grade. */
function buildQuery(p: CardSearchParams, includeGrade = true): string {
  const parts: (string | null | undefined)[] = [
    p.year,
    p.playerName,
    p.setName,
    p.parallelType ?? p.insert,
    includeGrade && p.gradingCompany && p.gradingCompany.toLowerCase() !== "raw"
      ? p.gradingCompany
      : null,
    includeGrade && p.grade && p.grade.toLowerCase() !== "raw" ? p.grade : null,
  ];
  return parts.filter(Boolean).join(" ");
}

/**
 * Returns a list of marketplace links pre-populated with the card's details.
 * All URLs open in a new tab.
 */
export function buildMarketplaceLinks(p: CardSearchParams): MarketplaceLink[] {
  const q = encodeURIComponent(buildQuery(p));
  const qNoGrade = encodeURIComponent(buildQuery(p, false));
  const playerQ = encodeURIComponent(p.playerName);
  const baseQ = encodeURIComponent([p.year, p.playerName].filter(Boolean).join(" "));

  return [
    {
      id: "ebay-sold",
      name: "eBay Sold",
      tagline: "Completed & sold listings",
      type: "sold",
      url: `https://www.ebay.com/sch/i.html?_nkw=${q}&LH_Sold=1&LH_Complete=1&_sacat=261328`,
      accentColor: "#E53238",
    },
    {
      id: "ebay-active",
      name: "eBay Active",
      tagline: "Current listings & auctions",
      type: "active",
      url: `https://www.ebay.com/sch/i.html?_nkw=${q}&_sacat=261328`,
      accentColor: "#E53238",
    },
    {
      id: "130point",
      name: "130point",
      tagline: "eBay sold comps aggregator",
      type: "sold",
      url: `https://www.130point.com/sales?q=${q}`,
      accentColor: "#4F46E5",
    },
    {
      id: "pwcc",
      name: "PWCC",
      tagline: "Premium auctions & weekly",
      type: "auction",
      url: `https://www.pwccmarketplace.com/marketplace?query=${qNoGrade}`,
      accentColor: "#1D4ED8",
    },
    {
      id: "goldin",
      name: "Goldin",
      tagline: "High-end card auctions",
      type: "auction",
      url: `https://goldin.co/search?q=${playerQ}`,
      accentColor: "#B45309",
    },
    {
      id: "comc",
      name: "COMC",
      tagline: "Raw & graded marketplace",
      type: "active",
      url: `https://www.comc.com/Cards/Football?q=${qNoGrade}`,
      accentColor: "#059669",
    },
    {
      id: "myslabs",
      name: "MySlabs",
      tagline: "Graded slab marketplace",
      type: "active",
      url: `https://www.myslabs.com/slabs?q=${q}`,
      accentColor: "#7C3AED",
    },
    {
      id: "beckett",
      name: "Beckett",
      tagline: "BVG price guide & census",
      type: "price-guide",
      url: `https://www.beckett.com/price-guide/football-cards?search=${baseQ}`,
      accentColor: "#DC2626",
    },
    {
      id: "alt",
      name: "Alt",
      tagline: "Fractional & direct sales",
      type: "active",
      url: `https://app.alt.xyz/search?q=${playerQ}`,
      accentColor: "#0EA5E9",
    },
    {
      id: "sportslots",
      name: "SportLots",
      tagline: "Budget & bulk marketplace",
      type: "active",
      url: `https://www.sportlots.com/cgi/find.tpl?page=search&query=${qNoGrade}`,
      accentColor: "#64748b",
    },
  ];
}

/** Badge label for each marketplace type */
export const MARKETPLACE_TYPE_LABELS: Record<MarketplaceType, string> = {
  sold: "SOLD",
  active: "ACTIVE",
  auction: "AUCTION",
  "price-guide": "PRICES",
};
