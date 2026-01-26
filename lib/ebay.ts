import * as cheerio from "cheerio";
import { mkdir, writeFile } from "fs/promises";
import type { Comp, CompsStats } from "@/types";

interface EbaySearchParams {
  player: string;
  year?: string;
  set?: string;
  grade?: string;
  cardNumber?: string;
  parallelType?: string;
  serialNumber?: string;
  variation?: string;
  autograph?: string;
  relic?: string;
  keywords?: string[];
}

// Normalize parallel type names to eBay-friendly alternatives
function getParallelAlternatives(parallelType: string): string[] {
  const lower = parallelType.toLowerCase();
  const alternatives: string[] = [parallelType]; // Always include original
  
  // Common eBay parallel name variations
  const mappings: Record<string, string[]> = {
    "holo": ["Holographic", "Holo Prizm", "Holo", "Holographic Prizm"],
    "holographic": ["Holo", "Holo Prizm", "Holographic Prizm"],
    "refractor": ["Refractor", "Chrome Refractor"],
    "silver prizm": ["Silver", "Silver Prizm", "Prizm Silver"],
    "gold prizm": ["Gold", "Gold Prizm", "Prizm Gold"],
    "red prizm": ["Red", "Red Prizm", "Prizm Red"],
    "blue prizm": ["Blue", "Blue Prizm", "Prizm Blue"],
    "green prizm": ["Green", "Green Prizm", "Prizm Green"],
    "orange prizm": ["Orange", "Orange Prizm", "Prizm Orange"],
    "purple prizm": ["Purple", "Purple Prizm", "Prizm Purple"],
    "black prizm": ["Black", "Black Prizm", "Prizm Black"],
    "shimmer": ["Shimmer", "Shimmer Prizm"],
    "cracked ice": ["Cracked Ice", "Ice"],
    "mojo": ["Mojo", "Mojo Prizm"],
    "wave": ["Wave", "Wave Prizm"],
  };
  
  // Check for exact match
  if (mappings[lower]) {
    alternatives.push(...mappings[lower]);
  } else {
    // Check for partial matches (e.g., "Silver Prizm" contains "silver")
    for (const [key, values] of Object.entries(mappings)) {
      if (lower.includes(key) || key.includes(lower)) {
        alternatives.push(...values);
      }
    }
  }
  
  // Remove duplicates and return
  return [...new Set(alternatives)];
}

export function buildSearchUrl(params: EbaySearchParams): string {
  // Build search query
  const queryParts: string[] = [params.player];
  if (params.year) queryParts.push(params.year);
  if (params.set) queryParts.push(params.set);
  if (params.grade) queryParts.push(params.grade);
  if (params.cardNumber) queryParts.push(params.cardNumber);
  if (params.parallelType) queryParts.push(params.parallelType);
  if (params.serialNumber) queryParts.push(params.serialNumber);
  if (params.variation) queryParts.push(params.variation);
  if (params.autograph) queryParts.push(params.autograph);
  if (params.relic) queryParts.push(params.relic);
  if (params.keywords?.length) queryParts.push(...params.keywords);

  const query = queryParts.join(" ");
  const encodedQuery = encodeURIComponent(query);

  // eBay sold listings URL
  // LH_Sold=1&LH_Complete=1 = Sold items only
  // _sop=13 = Sort by ending date (newest first)
  // _sacat=212 = Sports Trading Cards category
  return `https://www.ebay.com/sch/i.html?_nkw=${encodedQuery}&_sacat=212&LH_Sold=1&LH_Complete=1&_sop=13&_ipg=60`;
}

function normalizeSetForEbay(setName: string): string {
  let normalized = setName.trim();
  // Remove common sport suffixes used in internal data that sellers rarely include
  normalized = normalized.replace(
    /\s+(Football|Basketball|Baseball|Hockey|Soccer)\b/gi,
    ""
  );
  // Remove leading brand that sellers may omit
  normalized = normalized.replace(/^Panini\s+/i, "");
  return normalized.trim();
}

function detectEbayBlocked(html: string): boolean {
  const lower = html.toLowerCase();
  return (
    lower.includes("robot check") ||
    lower.includes("captcha") ||
    lower.includes("verify your identity") ||
    lower.includes("pardon the interruption") ||
    lower.includes("security measure") ||
    lower.includes("request blocked") ||
    lower.includes("access denied") ||
    lower.includes("enable javascript") ||
    lower.includes("checking your browser")
  );
}

async function maybeDumpHtml(
  html: string,
  meta: { url: string; status: number; contentType: string | null }
): Promise<void> {
  if (process.env.EBAY_DEBUG !== "1") return;
  try {
    const dir = "/tmp/cardzcheck-ebay";
    await mkdir(dir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const file = `${dir}/ebay-${timestamp}.html`;
    const header = `<!-- url: ${meta.url} | status: ${meta.status} | content-type: ${meta.contentType ?? "unknown"} -->\n`;
    await writeFile(file, header + html, "utf8");
    console.log(`🧾 EBAY_DEBUG saved HTML to ${file}`);
  } catch (error) {
    console.warn("⚠️ EBAY_DEBUG failed to save HTML:", error);
  }
}

function parsePrice(priceText: string): number | null {
  // Remove currency symbols and parse
  const cleaned = priceText
    .replace(/[^0-9.,]/g, "")
    .replace(",", "");

  const price = parseFloat(cleaned);
  return isNaN(price) ? null : price;
}

function parseDate(dateText: string): string {
  // eBay shows dates like "Sold Jan 15, 2024" or "Sold 2d ago"
  const now = new Date();

  if (dateText.includes("ago")) {
    // Handle relative dates
    const match = dateText.match(/(\d+)([dhm])/);
    if (match) {
      const value = parseInt(match[1]);
      const unit = match[2];

      if (unit === "d") {
        now.setDate(now.getDate() - value);
      } else if (unit === "h") {
        now.setHours(now.getHours() - value);
      } else if (unit === "m") {
        now.setMinutes(now.getMinutes() - value);
      }
    }
    return now.toISOString().split("T")[0];
  }

  // Try to parse absolute dates
  const dateMatch = dateText.match(
    /(?:Sold\s+)?([A-Za-z]+)\s+(\d{1,2})(?:,?\s*(\d{4}))?/
  );
  if (dateMatch) {
    const month = dateMatch[1];
    const day = parseInt(dateMatch[2]);
    const year = dateMatch[3] ? parseInt(dateMatch[3]) : now.getFullYear();

    const months: Record<string, number> = {
      Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
      Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
    };

    const monthNum = months[month.substring(0, 3)];
    if (monthNum !== undefined) {
      return new Date(year, monthNum, day).toISOString().split("T")[0];
    }
  }

  return now.toISOString().split("T")[0];
}

async function scrapeSingleSearch(params: EbaySearchParams): Promise<Comp[]> {
  const url = buildSearchUrl(params);
  console.log("🌐 Fetching eBay URL:", url);

  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
      "Cache-Control": "no-cache",
    },
  });

  if (!response.ok) {
    console.error(`❌ eBay request failed: ${response.status} ${response.statusText}`);
    throw new Error(`eBay request failed: ${response.status}`);
  }

  const html = await response.text();
  await maybeDumpHtml(html, {
    url: response.url,
    status: response.status,
    contentType: response.headers.get("content-type"),
  });
  if (detectEbayBlocked(html)) {
    console.error("❌ eBay blocked the request (bot check/captcha detected)");
    throw new Error("eBay blocked the request (bot check/captcha detected)");
  }
  const $ = cheerio.load(html);

  const comps: Comp[] = [];

  // Try NEW eBay structure first (s-card based - 2024+)
  const sCardItems = $("li[data-listingid]");
  console.log(`📄 Found ${sCardItems.length} s-card items (new structure)`);

  if (sCardItems.length > 0) {
    sCardItems.each((_, element) => {
      const $item = $(element);

      // Get title from s-card__title
      const title =
        $item.find(".s-card__title .su-styled-text").first().text().trim() ||
        $item.find(".s-card__title").first().text().trim();
      if (!title || title.toLowerCase().includes("shop on ebay")) return;

      // Get price from s-card__price
      const priceText = $item.find(".s-card__price").first().text();
      const price = parsePrice(priceText);
      if (!price) return;

      // Get sold date from s-card__caption
      const dateText =
        $item.find(".s-card__caption .su-styled-text").first().text() ||
        $item.find(".s-card__caption").first().text() ||
        "";
      const date = parseDate(dateText);

      // Get link from s-card__link
      const link = $item.find("a.s-card__link").first().attr("href") || "";

      // Get image from s-card__image
      const image =
        $item.find(".s-card__image img").attr("src") ||
        $item.find(".s-card__image img").attr("data-defer-load") ||
        $item.find(".s-card__image").attr("src") ||
        $item.find(".s-card__image").attr("data-defer-load") ||
        "";

      comps.push({
        title,
        price,
        date,
        link: link.split("?")[0], // Remove tracking params
        image: image || undefined,
        source: "ebay",
      });
    });
  }

  // Fallback to OLD eBay structure (s-item based - pre-2024)
  if (comps.length === 0) {
    console.log(`📄 Trying old s-item structure...`);
    $(".s-item").each((_, element) => {
      const $item = $(element);

      // Skip "Shop on eBay" placeholder items
      const title = $item.find(".s-item__title").text().trim();
      if (!title || title.toLowerCase().includes("shop on ebay")) {
        return;
      }

      // Get price (may have multiple prices for auction items)
      const priceText = $item.find(".s-item__price").first().text();
      const price = parsePrice(priceText);
      if (!price) return;

      // Get sold date
      const dateText = $item.find(".s-item__title--tagblock .POSITIVE").text() ||
        $item.find(".s-item__ended-date").text() ||
        "";
      const date = parseDate(dateText);

      // Get link
      const link = $item.find(".s-item__link").attr("href") || "";

      // Get image
      const image =
        $item.find(".s-item__image-img").attr("src") ||
        $item.find(".s-item__image-img").attr("data-src") ||
        "";

      comps.push({
        title,
        price,
        date,
        link: link.split("?")[0], // Remove tracking params
        image: image || undefined,
        source: "ebay",
      });
    });
  }

  console.log(`✅ Scraped ${comps.length} valid listings from eBay`);
  return comps;
}

export async function scrapeEbaySoldListings(
  params: EbaySearchParams
): Promise<Comp[]> {
  // Try the original search first
  let comps = await scrapeSingleSearch(params);
  
  // If we got results, return them
  if (comps.length > 0) {
    return comps;
  }
  
  console.log(`⚠️ No results with original query, trying fallback strategies...`);
  
  // Fallback 1: Try alternative parallel type names
  if (params.parallelType) {
    const alternatives = getParallelAlternatives(params.parallelType);
    console.log(`🔄 Trying ${alternatives.length} parallel type alternatives:`, alternatives);
    
    for (const alt of alternatives.slice(1)) { // Skip first (original)
      const altParams = { ...params, parallelType: alt };
      comps = await scrapeSingleSearch(altParams);
      if (comps.length > 0) {
        console.log(`✅ Found ${comps.length} results with alternative: "${alt}"`);
        return comps;
      }
    }
    
    // Fallback 2: Try without parallel type
    console.log(`🔄 Trying without parallel type...`);
    const noParallelParams = { ...params };
    delete noParallelParams.parallelType;
    comps = await scrapeSingleSearch(noParallelParams);
    if (comps.length > 0) {
      console.log(`✅ Found ${comps.length} results without parallel type`);
      return comps;
    }
  }

  // Fallback 2.5: Try normalized set name (remove sport suffix / Panini)
  if (params.set) {
    const normalizedSet = normalizeSetForEbay(params.set);
    if (normalizedSet && normalizedSet !== params.set) {
      console.log(`🔄 Trying normalized set name: "${normalizedSet}"`);
      const normalizedParams = { ...params, set: normalizedSet };
      comps = await scrapeSingleSearch(normalizedParams);
      if (comps.length > 0) {
        console.log(`✅ Found ${comps.length} results with normalized set`);
        return comps;
      }
    }
  }
  
  // Fallback 3: Try without set name (many listings omit it)
  if (params.set) {
    console.log(`🔄 Trying without set name...`);
    const noSetParams = { ...params };
    delete noSetParams.set;
    comps = await scrapeSingleSearch(noSetParams);
    if (comps.length > 0) {
      console.log(`✅ Found ${comps.length} results without set`);
      return comps;
    }
  }

  // Fallback 4: Try with just player + year + set (most basic search)
  if (params.year || params.set) {
    console.log(`🔄 Trying basic search (player + year + set only)...`);
    const basicParams: EbaySearchParams = {
      player: params.player,
      year: params.year,
      set: params.set,
    };
    comps = await scrapeSingleSearch(basicParams);
    if (comps.length > 0) {
      console.log(`✅ Found ${comps.length} results with basic search`);
      return comps;
    }
  }
  
  // Fallback 5: Try with just player + year
  if (params.year) {
    console.log(`🔄 Trying minimal search (player + year only)...`);
    const minimalParams: EbaySearchParams = {
      player: params.player,
      year: params.year,
    };
    comps = await scrapeSingleSearch(minimalParams);
    if (comps.length > 0) {
      console.log(`✅ Found ${comps.length} results with minimal search`);
      return comps;
    }
  }
  
  console.log(`❌ No results found after all fallback attempts`);
  return [];
}

export function calculateStats(comps: Comp[]): CompsStats {
  if (comps.length === 0) {
    return { cmv: 0, avg: 0, low: 0, high: 0, count: 0 };
  }

  const prices = comps.map((c) => c.price).sort((a, b) => a - b);
  const count = prices.length;

  // CMV is median
  let cmv: number;
  const mid = Math.floor(count / 2);
  if (count % 2 === 0) {
    cmv = (prices[mid - 1] + prices[mid]) / 2;
  } else {
    cmv = prices[mid];
  }

  const avg = prices.reduce((sum, p) => sum + p, 0) / count;
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

export function buildSearchQuery(params: EbaySearchParams): string {
  const parts = [params.player];
  if (params.year) parts.push(params.year);
  if (params.set) parts.push(params.set);
  if (params.grade) parts.push(params.grade);
  if (params.cardNumber) parts.push(params.cardNumber);
  if (params.parallelType) parts.push(params.parallelType);
  if (params.serialNumber) parts.push(params.serialNumber);
  if (params.variation) parts.push(params.variation);
  if (params.autograph) parts.push(params.autograph);
  if (params.relic) parts.push(params.relic);
  if (params.keywords?.length) parts.push(...params.keywords);
  return parts.join(" ");
}
