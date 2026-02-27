import { getAdminAuth } from "@/lib/admin";
import { getShopListingsWithStats } from "@/lib/shop/server";
import ShopStorefront from "@/components/shop/ShopStorefront";

export default async function ShopPage() {
  const [{ listings, stats }, admin] = await Promise.all([
    getShopListingsWithStats(),
    getAdminAuth(),
  ]);

  return (
    <ShopStorefront
      initialListings={listings}
      stats={stats}
      isAdmin={!!admin.user}
    />
  );
}
