import type { Metadata } from "next";
import { getAdminAuth, isAdmin } from "@/lib/admin";
import { getShopListingsWithStats } from "@/lib/shop/server";
import ShopStorefront from "@/components/shop/ShopStorefront";

export const metadata: Metadata = {
  title: "CardzCheck Deals",
};

export default async function ShopPage() {
  const [{ listings, stats }, admin] = await Promise.all([
    getShopListingsWithStats(),
    getAdminAuth(),
  ]);

  return (
    <ShopStorefront
      initialListings={listings}
      stats={stats}
      isAdmin={isAdmin(admin.user)}
    />
  );
}
