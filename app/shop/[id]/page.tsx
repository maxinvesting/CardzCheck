import { createClient, createServiceClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import ShopListingDetail from "@/components/shop/ShopListingDetail";
import { getRelatedListings } from "@/lib/shop/server";
import { hasActiveBusinessTier, hasActiveProTier, type SubscriptionTier } from "@/lib/subscription-tier";
import type { ShopListing } from "@/types/shop";

const PUBLIC_COLUMNS =
  "id,created_at,updated_at,title,slug,description,inventory_item_id,player_name,year,set_brand,parallel_variant,card_number,grade,condition,cert_number,sport,price,cmv,quantity,quantity_sold,image_urls,thumbnail_url,status,publish_state,featured,is_premium,accepts_offers,shipping_method,shipping_cost,tags,ebay_comp_url,ebay_storefront_price,ai_insight,ai_insight_at,grade_analysis,grade_analysis_at";

async function getListing(id: string): Promise<ShopListing | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("shop_listings")
    .select(PUBLIC_COLUMNS)
    .eq("id", id)
    .eq("status", "active")
    .eq("publish_state", "published")
    .single();

  if (error || !data) return null;
  return data as ShopListing;
}

async function getUserTier(): Promise<SubscriptionTier | null> {
  try {
    const userClient = await createClient();
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return null;

    const serviceClient = await createServiceClient();
    const { data: sub } = await serviceClient
      .from("subscriptions")
      .select("tier, status, current_period_end")
      .eq("user_id", user.id)
      .single();

    if (hasActiveBusinessTier(sub)) return "business";
    if (hasActiveProTier(sub)) return "pro";
    return "free";
  } catch {
    return null;
  }
}

export default async function ShopListingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [listing, userTier] = await Promise.all([getListing(id), getUserTier()]);

  if (!listing) {
    notFound();
  }

  const relatedListings = await getRelatedListings(id, listing);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 md:py-12">
      <ShopListingDetail listing={listing} relatedListings={relatedListings} userTier={userTier} />
    </div>
  );
}
