import type { Metadata } from "next";
import { getAdminAuth, isAdmin } from "@/lib/admin";
import { getShopListingsWithStats } from "@/lib/shop/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { hasActiveBusinessTier, hasActiveProTier, type SubscriptionTier } from "@/lib/subscription-tier";
import ShopStorefront from "@/components/shop/ShopStorefront";

export const metadata: Metadata = {
  title: "CardzCheck Deals",
};

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

export default async function ShopPage() {
  const [{ listings, stats }, admin, userTier] = await Promise.all([
    getShopListingsWithStats(),
    getAdminAuth(),
    getUserTier(),
  ]);

  return (
    <ShopStorefront
      initialListings={listings}
      stats={stats}
      isAdmin={isAdmin(admin.user)}
      userTier={userTier}
    />
  );
}
