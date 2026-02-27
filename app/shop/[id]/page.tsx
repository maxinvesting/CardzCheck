import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import ShopListingDetail from "@/components/shop/ShopListingDetail";
import { getRelatedListings } from "@/lib/shop/server";
import type { ShopListing } from "@/types/shop";

const PUBLIC_COLUMNS =
  "id,created_at,updated_at,slug,description,player_name,year,set_brand,parallel_variant,card_number,grade,cert_number,sport,price,cmv,quantity,quantity_sold,image_urls,thumbnail_url,status,featured,is_premium,shipping_method,shipping_cost,tags";

async function getListing(id: string): Promise<ShopListing | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("shop_listings")
    .select(PUBLIC_COLUMNS)
    .eq("id", id)
    .eq("status", "active")
    .single();

  if (error || !data) return null;
  return data as ShopListing;
}

export default async function ShopListingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const listing = await getListing(id);

  if (!listing) {
    notFound();
  }

  const relatedListings = await getRelatedListings(id, listing);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 md:py-12">
      <ShopListingDetail listing={listing} relatedListings={relatedListings} />
    </div>
  );
}
