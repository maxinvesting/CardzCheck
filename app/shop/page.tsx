import { createClient } from "@/lib/supabase/server";
import ShopStorefront from "@/components/shop/ShopStorefront";
import type { ShopListing } from "@/types/shop";

// Select columns for public display; exclude cost_basis (admin only)
const PUBLIC_COLUMNS =
  "id,created_at,updated_at,slug,description,player_name,year,set_brand,parallel_variant,card_number,grade,cert_number,sport,price,cmv,quantity,quantity_sold,image_urls,thumbnail_url,status,featured,is_premium,shipping_method,shipping_cost,notes,tags";

async function getActiveListings(): Promise<ShopListing[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("shop_listings")
    .select(PUBLIC_COLUMNS)
    .eq("status", "active")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching shop listings:", error);
    return [];
  }
  return (data ?? []) as ShopListing[];
}

export default async function ShopPage() {
  const listings = await getActiveListings();

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <ShopStorefront initialListings={listings} />
    </div>
  );
}
