import { createClient } from "@/lib/supabase/server";
import type { ShopListing } from "@/types/shop";

const PUBLIC_COLUMNS =
  "id,created_at,updated_at,title,slug,description,inventory_item_id,player_name,year,set_brand,parallel_variant,card_number,grade,condition,cert_number,sport,price,cmv,ebay_storefront_price,quantity,quantity_sold,image_urls,thumbnail_url,status,publish_state,featured,is_premium,shipping_method,shipping_cost,tags,ebay_comp_url,ai_insight,ai_insight_at,grade_analysis,grade_analysis_at";

export interface ShopStats {
  activeCount: number;
  totalInventoryValue: number;
  belowCmvCount: number;
  belowCmvPct: number;
  avgGrade: string;
}

function gradeToScore(grade: string): number {
  const g = (grade ?? "").toLowerCase();
  if (g.includes("10") || g === "psa 10" || g === "bgs 10" || g === "sgc 10") return 10;
  if (g.includes("9.5") || g.includes("9 1/2")) return 9.5;
  if (g.includes("9")) return 9;
  if (g.includes("8")) return 8;
  if (g.includes("7")) return 7;
  if (g.includes("raw") || g.includes("ungraded") || g === "") return 3;
  const match = g.match(/(\d+\.?\d*)/);
  return match ? parseFloat(match[1]) : 5;
}

function scoreToLabel(score: number): string {
  if (score >= 10) return "PSA 10";
  if (score >= 9.5) return "9.5";
  if (score >= 9) return "PSA 9";
  if (score >= 8) return "8+";
  if (score <= 3) return "Raw";
  return "Graded";
}

export async function getShopListingsWithStats(): Promise<{
  listings: ShopListing[];
  stats: ShopStats;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("shop_listings")
    .select(PUBLIC_COLUMNS)
    .eq("status", "active")
    .eq("publish_state", "published")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching shop listings:", error);
    return { listings: [], stats: defaultStats() };
  }

  const listings = (data ?? []) as ShopListing[];
  const stats = computeStats(listings);
  return { listings, stats };
}

function defaultStats(): ShopStats {
  return {
    activeCount: 0,
    totalInventoryValue: 0,
    belowCmvCount: 0,
    belowCmvPct: 0,
    avgGrade: "—",
  };
}

function computeStats(listings: ShopListing[]): ShopStats {
  let totalInventoryValue = 0;
  let belowCmvCount = 0;
  let gradeSum = 0;
  let gradeN = 0;

  for (const l of listings) {
    const available = Math.max(0, (l.quantity ?? 0) - (l.quantity_sold ?? 0));
    totalInventoryValue += Number(l.price) * available;

    if (l.cmv != null && l.cmv > 0 && l.price < l.cmv) {
      belowCmvCount++;
    }

    const score = gradeToScore(l.grade ?? "");
    gradeSum += score;
    gradeN++;
  }

  const activeCount = listings.length;
  const belowCmvPct = activeCount > 0 ? (belowCmvCount / activeCount) * 100 : 0;
  const avgScore = gradeN > 0 ? gradeSum / gradeN : 0;
  const avgGrade = gradeN > 0 ? scoreToLabel(avgScore) : "—";

  return {
    activeCount,
    totalInventoryValue,
    belowCmvCount,
    belowCmvPct,
    avgGrade,
  };
}

export async function getRelatedListings(
  listingId: string,
  listing: ShopListing
): Promise<ShopListing[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("shop_listings")
    .select(PUBLIC_COLUMNS)
    .eq("status", "active")
    .eq("publish_state", "published")
    .neq("id", listingId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error || !data) return [];

  const candidates = data as ShopListing[];
  const priceMin = listing.price - 50;
  const priceMax = listing.price + 50;

  const samePlayer = candidates.filter(
    (c) => c.player_name?.toLowerCase() === listing.player_name?.toLowerCase()
  );
  const sameCategory = candidates.filter(
    (c) => c.sport === listing.sport && c.player_name !== listing.player_name
  );
  const similarPrice = candidates.filter(
    (c) =>
      c.price >= priceMin &&
      c.price <= priceMax &&
      c.id !== listingId &&
      !samePlayer.some((p) => p.id === c.id)
  );

  const seen = new Set<string>();
  const related: ShopListing[] = [];

  for (const c of [...samePlayer, ...sameCategory, ...similarPrice]) {
    if (seen.has(c.id) || related.length >= 6) continue;
    seen.add(c.id);
    related.push(c);
  }

  return related;
}
