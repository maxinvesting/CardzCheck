import type { CompsParams } from "@/lib/ebay/comps-url";

function cleanPart(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 0 ? normalized : null;
}

function hasRawGrade(params: CompsParams): boolean {
  return cleanPart(params.grade)?.toLowerCase() === "raw";
}

function buildGradeLabel(params: CompsParams): string | null {
  if (hasRawGrade(params)) return null;

  const grade = cleanPart(params.grade);
  if (!grade) return null;

  if (/^(PSA|BGS|SGC|CGC|CSG|TAG)\b/i.test(grade)) {
    return grade;
  }

  const company = cleanPart(params.gradingCompany);
  return company ? `${company} ${grade}` : grade;
}

function encodeComcQuery(query: string): string {
  return encodeURIComponent(query).replace(/%20/g, "+");
}

export function buildMarketplaceSearchQuery(params: CompsParams): string {
  const parts: string[] = [];

  const year = cleanPart(params.year);
  const player = cleanPart(params.player);
  const setName = cleanPart(params.setName);
  const parallel = cleanPart(params.parallel);
  const cardNumber = cleanPart(params.cardNumber);
  const serialNumber = cleanPart(params.serialNumber);
  const gradeLabel = buildGradeLabel(params);

  if (year) parts.push(year);
  if (player) parts.push(player);
  if (setName) parts.push(setName);
  if (parallel && parallel.toLowerCase() !== "base") parts.push(parallel);
  if (cardNumber) parts.push(`#${cardNumber.replace(/^#/, "")}`);
  if (serialNumber) parts.push(`/${serialNumber.replace(/^\//, "")}`);
  if (gradeLabel) parts.push(gradeLabel);

  if (parts.length > 0) return parts.join(" ");

  return cleanPart(params.title) ?? "sports trading card";
}

export function buildEbaySearchUrl(params: CompsParams): string {
  const url = new URL("https://www.ebay.com/sch/i.html");
  url.searchParams.set("_nkw", buildMarketplaceSearchQuery(params));
  return url.toString();
}

export function buildFanaticsCollectSearchUrl(params: CompsParams): string {
  const url = new URL("https://www.fanaticscollect.com/marketplace");
  url.searchParams.set("type", "FIXED");
  url.searchParams.set("q", buildMarketplaceSearchQuery(params));
  return url.toString();
}

export function buildFacebookMarketplaceSearchUrl(params: CompsParams): string {
  const url = new URL("https://www.facebook.com/marketplace/search/");
  url.searchParams.set("query", buildMarketplaceSearchQuery(params));
  return url.toString();
}

export function buildBeckettMarketplaceSearchUrl(params: CompsParams): string {
  const url = new URL("https://marketplace.beckett.com/search_new/");
  url.searchParams.set("term", buildMarketplaceSearchQuery(params));
  return url.toString();
}

export function buildMySlabsSearchUrl(params: CompsParams): string {
  const url = new URL("https://myslabs.com/search/all/");
  url.searchParams.set("q", buildMarketplaceSearchQuery(params));
  return url.toString();
}

export function buildComcSearchUrl(params: CompsParams): string {
  const query = encodeComcQuery(buildMarketplaceSearchQuery(params));
  return `https://www.comc.com/Cards,=${query}`;
}
