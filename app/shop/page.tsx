import type { Metadata } from "next";
import { getAdminAuth, isAdmin } from "@/lib/admin";
import { getShopListingsWithStats } from "@/lib/shop/server";
import { createClient } from "@/lib/supabase/server";
import ShopStorefront from "@/components/shop/ShopStorefront";

export const metadata: Metadata = {
  title: "CardzCheck Deals",
};

async function getIsBusinessUser(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const { data: sub } = await supabase
      .from("subscriptions")
      .select("tier, status, current_period_end")
      .eq("user_id", user.id)
      .single();

    if (!sub || sub.tier !== "business" || sub.status !== "active") return false;
    if (sub.current_period_end && new Date(sub.current_period_end) <= new Date()) return false;
    return true;
  } catch {
    return false;
  }
}

export default async function ShopPage() {
  const [{ listings, stats }, admin, isBusiness] = await Promise.all([
    getShopListingsWithStats(),
    getAdminAuth(),
    getIsBusinessUser(),
  ]);

  return (
    <ShopStorefront
      initialListings={listings}
      stats={stats}
      isAdmin={isAdmin(admin.user)}
      isBusiness={isBusiness}
    />
  );
}
