import { redirect } from "next/navigation";
import Link from "next/link";
import { getAdminAuth } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/server";
import FlaggedClient, { type FlaggedRow } from "./FlaggedClient";

export const dynamic = "force-dynamic";

export default async function FlaggedListingsPage() {
  const admin = await getAdminAuth();
  if (!admin.user) redirect("/");

  const service = await createServiceClient();
  const { data } = await service
    .from("listings")
    .select(
      "id, list_price_cents, listed_at, day60_triggered_at, marketplace_cards!inner(title, player, year, grade)"
    )
    .eq("status", "flagged")
    .order("day60_triggered_at", { ascending: true });

  const rows = ((data ?? []) as unknown as FlaggedRow[]) ?? [];

  return (
    <>
      <main className="p-6 lg:p-10 text-white">
        <div className="max-w-5xl mx-auto space-y-6">
          <div>
            <Link
              href="/admin/marketplace"
              className="text-sm text-gray-400 hover:text-white"
            >
              ← Marketplace
            </Link>
            <h1 className="text-2xl font-bold mt-2">Flagged listings</h1>
            <p className="text-sm text-gray-400 mt-1">
              Day-60 listings awaiting a decision: convert to self-serve, return to seller, or remove.
            </p>
          </div>
          <FlaggedClient rows={rows} />
        </div>
      </main>
    </>
  );
}
