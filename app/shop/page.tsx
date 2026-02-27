import { getAdminAuth } from "@/lib/admin";
import { getShopListingsWithStats } from "@/lib/shop/server";
import ShopStorefront from "@/components/shop/ShopStorefront";

export default async function ShopPage() {
  const [{ listings, stats }, admin] = await Promise.all([
    getShopListingsWithStats(),
    getAdminAuth(),
  ]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 md:py-10">
      <ShopStorefront
        initialListings={listings}
        stats={stats}
        isAdmin={!!admin.user}
      />
    </div>
  );
}
