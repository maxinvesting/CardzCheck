import { getAdminAuth } from "@/lib/admin";
import { getShopListingsWithStats } from "@/lib/shop/server";
import ShopStorefront from "@/components/shop/ShopStorefront";

export default async function ShopPage() {
  const [{ listings, stats }, admin] = await Promise.all([
    getShopListingsWithStats(),
    getAdminAuth(),
  ]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-10 md:py-12">
      <ShopStorefront
        initialListings={listings}
        stats={stats}
        isAdmin={!!admin.user}
      />
    </div>
  );
}
