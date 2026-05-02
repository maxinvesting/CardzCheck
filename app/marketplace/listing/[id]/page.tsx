import { notFound } from "next/navigation";
import Link from "next/link";
import AuthenticatedLayout from "@/components/AuthenticatedLayout";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import BuyButton from "./BuyButton";

export const dynamic = "force-dynamic";

const PIPELINE_BADGE: Record<string, string> = {
  standard: "border-gray-700 text-gray-400",
  elite: "border-purple-500 text-purple-300",
  grails: "border-amber-500 text-amber-300",
};

export default async function ListingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const userClient = await createClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();

  const service = await createServiceClient();
  const { data: listing } = await service
    .from("listings")
    .select(
      "id, status, list_price_cents, cmv_low_cents, cmv_mid_cents, cmv_high_cents, pipeline, mode, seller_id, listed_at, marketplace_cards!inner(title, year, player, grade, grading_service, cert_number, parallel)"
    )
    .eq("id", id)
    .single();

  if (!listing) notFound();
  if (!["active", "price_reduced"].includes(listing.status)) {
    return (
      <AuthenticatedLayout>
        <main className="p-6 lg:p-10 text-white">
          <div className="max-w-2xl mx-auto space-y-4">
            <Link href="/marketplace" className="text-sm text-gray-400 hover:text-white">
              ← Marketplace
            </Link>
            <div className="rounded border border-gray-800 p-6 text-center text-sm text-gray-400">
              This listing is no longer for sale.
            </div>
          </div>
        </main>
      </AuthenticatedLayout>
    );
  }

  const card = (listing as unknown as {
    marketplace_cards: {
      title: string;
      year: number;
      player: string;
      grade: string;
      grading_service: string;
      cert_number: string | null;
      parallel: string | null;
    };
  }).marketplace_cards;

  return (
    <AuthenticatedLayout>
      <main className="p-6 lg:p-10 text-white">
        <div className="max-w-2xl mx-auto space-y-6">
          <Link href="/marketplace" className="text-sm text-gray-400 hover:text-white">
            ← Marketplace
          </Link>

          <div>
            <div className="flex items-start justify-between gap-3">
              <h1 className="text-2xl font-bold">{card.title}</h1>
              <span
                className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded border ${
                  PIPELINE_BADGE[listing.pipeline] ?? "border-gray-700"
                }`}
              >
                {listing.pipeline}
              </span>
            </div>
            <div className="text-sm text-gray-400 mt-2">
              {card.year} · {card.player}
              {card.parallel ? ` · ${card.parallel}` : ""}
            </div>
          </div>

          <div className="rounded-xl border border-gray-800 bg-gray-900 p-6 space-y-4">
            <div>
              <div className="text-xs uppercase text-gray-400">Price</div>
              <div className="text-3xl font-bold mt-1">
                ${(listing.list_price_cents / 100).toLocaleString()}
              </div>
              {listing.status === "price_reduced" && (
                <div className="text-xs text-amber-400 mt-1">
                  Price reduced (day-30)
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <Stat label="Grading" value={`${card.grading_service} ${card.grade}`} />
              <Stat label="Cert #" value={card.cert_number ?? "—"} />
              <Stat
                label="Listed"
                value={new Date(listing.listed_at).toLocaleDateString()}
              />
              <Stat
                label="CMV mid"
                value={
                  listing.cmv_mid_cents != null
                    ? `$${(listing.cmv_mid_cents / 100).toLocaleString()}`
                    : "—"
                }
              />
            </div>

            <BuyButton
              listingId={listing.id}
              isLoggedIn={!!user}
              isOwnListing={!!user && user.id === listing.seller_id}
            />
          </div>
        </div>
      </main>
    </AuthenticatedLayout>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase text-gray-500">{label}</div>
      <div>{value}</div>
    </div>
  );
}
