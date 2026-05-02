import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import AuthenticatedLayout from "@/components/AuthenticatedLayout";
import { getAdminAuth } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/server";
import AdminListingClient, { type AdminListing } from "./AdminListingClient";

export const dynamic = "force-dynamic";

export default async function AdminListingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const admin = await getAdminAuth();
  if (!admin.user) redirect("/");

  const { id } = await params;
  const service = await createServiceClient();
  const { data: listing } = await service
    .from("listings")
    .select(
      "id, status, mode, list_price_cents, cmv_low_cents, cmv_mid_cents, cmv_high_cents, fee_tier, pipeline, negotiated_fee_cents, listed_at, day30_triggered_at, day60_triggered_at, marketplace_cards!inner(title, year, grade)"
    )
    .eq("id", id)
    .single();
  if (!listing) notFound();

  const card = (listing as unknown as {
    marketplace_cards: { title: string; year: number; grade: string };
  }).marketplace_cards;

  const adminListing: AdminListing = {
    id: listing.id,
    pipeline: listing.pipeline,
    fee_tier: listing.fee_tier,
    list_price_cents: listing.list_price_cents,
    negotiated_fee_cents: listing.negotiated_fee_cents,
    status: listing.status,
    mode: listing.mode,
  };

  return (
    <AuthenticatedLayout>
      <main className="p-6 lg:p-10 text-white">
        <div className="max-w-3xl mx-auto space-y-6">
          <div>
            <Link
              href="/admin/marketplace"
              className="text-sm text-gray-400 hover:text-white"
            >
              ← Marketplace
            </Link>
            <h1 className="text-2xl font-bold mt-2">{card.title}</h1>
            <div className="text-sm text-gray-400 mt-1">
              {card.year} · {card.grade} · {listing.pipeline} pipeline ·{" "}
              {listing.mode}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 text-sm">
            <Stat label="List price" value={`$${(listing.list_price_cents / 100).toLocaleString()}`} />
            <Stat label="CMV mid" value={listing.cmv_mid_cents != null ? `$${(listing.cmv_mid_cents / 100).toLocaleString()}` : "—"} />
            <Stat label="Status" value={listing.status} />
          </div>

          <AdminListingClient listing={adminListing} />
        </div>
      </main>
    </AuthenticatedLayout>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-gray-800 bg-gray-900 p-3">
      <div className="text-xs uppercase text-gray-400">{label}</div>
      <div className="text-base mt-1">{value}</div>
    </div>
  );
}
