/**
 * Shared utility for building eBay sold listings search URLs.
 * Used by the "Get Comps" button (UI) and Business Consultant (AI prompt context).
 */

export interface CompsParams {
  player?: string | null;
  year?: string | null;
  setName?: string | null;
  parallel?: string | null;
  cardNumber?: string | null;
  gradingCompany?: string | null;
  grade?: string | null;
  /** Print run serial, e.g. "180" for /180 */
  serialNumber?: string | null;
  /** Fallback: full title string when structured fields are unavailable */
  title?: string | null;
}

/**
 * Encode a search term for eBay's _nkw parameter.
 * Spaces become +, # becomes %23, / becomes %2F.
 */
function encodeEbayTerm(s: string): string {
  return encodeURIComponent(s.trim()).replace(/%20/g, "+");
}

/**
 * Build an eBay sold listings search URL from card identity params.
 *
 * @param params - Card identity fields (structured or title fallback)
 * @param gradeOverride - Grade prefix to use instead of the card's own grade.
 *   Pass "PSA 10", "PSA 9", "BGS 9.5", "raw", or null.
 *   Passing "raw" omits any grade prefix.
 */
export function buildEbaySoldUrl(
  params: CompsParams,
  gradeOverride?: string | null
): string {
  const parts: string[] = [];

  // ── Grade prefix ───────────────────────────────────────────────────
  const useRaw =
    gradeOverride === "raw" ||
    (!gradeOverride && params.grade?.toLowerCase() === "raw");

  if (!useRaw) {
    if (gradeOverride) {
      parts.push(gradeOverride);
    } else if (params.grade) {
      // Avoid duplicating company name if already embedded, e.g. "PSA 10"
      const gradeHasCompany = /^(PSA|BGS|SGC|CGC)\s/i.test(params.grade);
      const company = params.gradingCompany ?? "PSA";
      parts.push(gradeHasCompany ? params.grade : `${company} ${params.grade}`);
    }
  }

  // ── Card identity ──────────────────────────────────────────────────
  const hasStructured = !!(params.player || params.year || params.setName);

  if (hasStructured) {
    if (params.year) parts.push(params.year);
    if (params.setName) parts.push(params.setName);
    if (params.player) parts.push(params.player);
    if (params.parallel) parts.push(params.parallel);
    if (params.cardNumber) parts.push(`#${params.cardNumber}`);
    if (params.serialNumber) parts.push(`/${params.serialNumber}`);
  } else if (params.title) {
    parts.push(params.title);
  }

  const nkw = parts.map(encodeEbayTerm).join("+");

  return `https://www.ebay.com/sch/i.html?_nkw=${nkw}&LH_Sold=1&LH_Complete=1&LH_ItemCondition=4`;
}

/**
 * Generate the three standard comp links (PSA 10, PSA 9, raw).
 * Used by the Business Consultant and Grade Probability Panel.
 */
export function buildCompsLinks(params: CompsParams): {
  psa10Url: string;
  psa9Url: string;
  rawUrl: string;
} {
  return {
    psa10Url: buildEbaySoldUrl(params, "PSA 10"),
    psa9Url: buildEbaySoldUrl(params, "PSA 9"),
    rawUrl: buildEbaySoldUrl(params, "raw"),
  };
}

/**
 * Build an eBay pre-filled sell form URL.
 * categoryId=213 = Sports Trading Cards. eBay title limit is 80 chars.
 */
export function buildEbayListUrl(title: string): string {
  return `https://www.ebay.com/sell/listing?title=${encodeURIComponent(title.trim().slice(0, 80))}&categoryId=213`;
}

/**
 * Build a CompsParams object from a BusinessInventoryItem title + grade fields.
 * Used when only the denormalized title is available (InventoryTable rows).
 */
export function compsParamsFromTitle(
  title: string | null | undefined,
  grade?: string | null,
  gradingCompany?: string | null
): CompsParams {
  return {
    title: title ?? undefined,
    grade: grade ?? undefined,
    gradingCompany: gradingCompany ?? undefined,
  };
}
