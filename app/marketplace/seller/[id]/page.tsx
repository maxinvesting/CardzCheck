/**
 * Minimal seller profile. Shows a header for the seller, their active
 * listings count, and a Contact seller button that opens a marketplace
 * thread via /api/marketplace/messages/start.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import AuthenticatedLayout from "@/components/AuthenticatedLayout";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import ContactSellerButton from "./ContactSellerButton";

export const dynamic = "force-dynamic";

function maskEmail(email: string | null | undefined): string {
  if (!email) return "Seller";
  const local = email.split("@")[0] ?? email;
  return local || "Seller";
}

export default async function SellerProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: sellerId } = await params;

  const userClient = await createClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();

  const service = await createServiceClient();

  const [{ data: profile }, { data: storefront }, { count: listingCount }] =
    await Promise.all([
      service.from("users").select("id, email").eq("id", sellerId).maybeSingle(),
      service
        .from("user_storefronts")
        .select("display_name, platform, store_url")
        .eq("user_id", sellerId)
        .eq("is_primary", true)
        .maybeSingle(),
      service
        .from("listings")
        .select("id", { count: "exact", head: true })
        .eq("seller_id", sellerId)
        .in("status", ["active", "price_reduced"]),
    ]);

  if (!profile) notFound();

  const sellerName =
    (storefront as { display_name?: string } | null)?.display_name ??
    maskEmail((profile as { email: string | null }).email);

  return (
    <AuthenticatedLayout>
      <main className="min-h-screen bg-[#090B0D] text-[#E6E8EB]">
        <div className="mx-auto max-w-3xl px-4 py-6">
          <Link
            href="/marketplace"
            className="text-[12px] text-[#77808C] hover:text-[#E6E8EB]"
          >
            ← Marketplace
          </Link>

          <header className="mt-4 flex flex-wrap items-start justify-between gap-3 border-b border-[#24282D] pb-5">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#77808C]">
                Seller
              </p>
              <h1 className="mt-1 truncate text-[22px] font-semibold text-white">
                {sellerName}
              </h1>
              <p className="mt-1 text-[12px] text-[#B8C0CC]">
                {listingCount ?? 0} active listing{listingCount === 1 ? "" : "s"}
              </p>
            </div>
            <ContactSellerButton
              sellerId={sellerId}
              isLoggedIn={!!user}
              isSelf={!!user && user.id === sellerId}
            />
          </header>

          <section className="mt-6 grid gap-3 text-[12px] text-[#B8C0CC] sm:grid-cols-2">
            {storefront ? (
              <div className="border border-[#24282D] bg-[#0F1317] p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#77808C]">
                  Storefront
                </p>
                <p className="mt-1 text-white">
                  {(storefront as { display_name: string }).display_name}
                </p>
                {(storefront as { store_url?: string | null }).store_url ? (
                  <a
                    href={(storefront as { store_url: string }).store_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-block text-[11px] text-white/70 underline hover:text-white"
                  >
                    Visit external store ↗
                  </a>
                ) : null}
              </div>
            ) : null}
            <div className="border border-[#24282D] bg-[#0F1317] p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#77808C]">
                On CardzCheck
              </p>
              <Link
                href={`/marketplace?seller=${sellerId}`}
                className="mt-1 inline-block text-white hover:underline"
              >
                Browse all listings →
              </Link>
            </div>
          </section>
        </div>
      </main>
    </AuthenticatedLayout>
  );
}
