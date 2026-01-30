// eBay Integration - Legacy Wrapper
// This file maintains backwards compatibility with existing code
// New code should import from '@/lib/ebay/index'

import type { Comp, CompsStats } from "@/types";
import {
  searchEbayLegacy,
  buildSearchQuery as buildQuery,
  buildSoldListingsUrl,
  type EbaySearchParams,
} from "./ebay/index";

// Re-export types for backwards compatibility
export type { EbaySearchParams } from "./ebay/types";

/**
 * Build search URL for eBay sold listings (external link)
 */
export function buildSearchUrl(params: EbaySearchParams): string {
  return buildSoldListingsUrl(params);
}

/**
 * Build search query string from params
 */
export function buildSearchQuery(params: EbaySearchParams): string {
  return buildQuery(params);
}

/**
 * Calculate stats from comps array
 */
export function calculateStats(comps: Comp[]): CompsStats {
  if (comps.length === 0) {
    return { cmv: 0, avg: 0, low: 0, high: 0, count: 0 };
  }

  const prices = comps.map((c) => c.price).sort((a, b) => a - b);
  const count = prices.length;

  // Calculate average
  const avg = prices.reduce((sum, p) => sum + p, 0) / count;
  
  // CMV is the average (as requested by user)
  const cmv = avg;
  
  const low = prices[0];
  const high = prices[count - 1];

  return {
    cmv: Math.round(cmv * 100) / 100,
    avg: Math.round(avg * 100) / 100,
    low,
    high,
    count,
  };
}

/**
 * Search eBay for sold listings (legacy function)
 * Uses the new dual-signal system under the hood but returns old format
 */
export async function scrapeEbaySoldListings(params: EbaySearchParams): Promise<Comp[]> {
  const result = await searchEbayLegacy(params);
  return result.comps;
}
