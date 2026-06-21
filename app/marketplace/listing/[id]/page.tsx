import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import BuyButton from "./BuyButton";
import MessageSellerButton from "./MessageSellerButton";

export const dynamic = "force-dynamic";

const PIPELINE_CHIP: Record<string, string> = {
  standard: "border-[#343941] text-[#B8C0CC] bg-[#0B0D0F]",
  elite: "border-purple-500/40 text-purple-300 bg-purple-900/20",
  grails: "border-amber-500/40 text-amber-300 bg-amber-900/20",
};

const MONEY = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function fmtCents(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return MONEY.format(cents / 100);
}

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
      "id, status, list_price_cents, shipping_cents, cmv_low_cents, cmv_mid_cents, cmv_high_cents, pipeline, mode, seller_id, listed_at, marketplace_cards!inner(title, year, player, grade, grading_service, cert_number, parallel, image_url)"
    )
    .eq("id", id)
    .single();

  if (!listing) notFound();

  // Is the seller able to receive money? If not, the buy button is disabled
  // with an explanation rather than a dead-end checkout error.
  const { data: payoutRow } = await service
    .from("seller_payout_accounts")
    .select("charges_enabled, payouts_enabled, stripe_account_id")
    .eq("user_id", listing.seller_id)
    .maybeSingle();
  const sellerReady = Boolean(
    payoutRow?.stripe_account_id &&
      payoutRow.charges_enabled &&
      payoutRow.payouts_enabled
  );

  if (!["active", "price_reduced"].includes(listing.status)) {
    return (
      <>
        <main className="min-h-screen bg-[#090B0D] text-[#E6E8EB]">
          <div className="mx-auto max-w-3xl px-4 py-8">
            <Link
              href="/marketplace"
              className="text-[12px] text-[#77808C] hover:text-[#E6E8EB]"
            >
              ← Marketplace
            </Link>
            <div className="mt-4 border border-[#24282D] bg-[#0F1317] p-8 text-center text-[12px] text-[#77808C]">
              This listing is no longer for sale.
            </div>
          </div>
        </main>
      </>
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
      image_url: string | null;
    };
  }).marketplace_cards;

  const shippingCents = (listing as { shipping_cents: number | null }).shipping_cents ?? 0;
  const listCents = listing.list_price_cents;

  // Build a recent-sold-comps search so buyers can verify pricing against live
  // market data themselves. We don't publish our own valuation, so the comps
  // links are the source of truth rather than an internal CMV estimate.
  const gradeLabel = card.grade?.toUpperCase().includes(
    card.grading_service?.toUpperCase() ?? ""
  )
    ? card.grade
    : `${card.grading_service ?? ""} ${card.grade ?? ""}`.trim();
  const compsQuery = [
    card.year,
    card.title,
    card.player,
    card.parallel,
    gradeLabel,
  ]
    .filter(Boolean)
    .join(" ");
  const ebaySoldUrl = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(
    compsQuery
  )}&LH_Sold=1&LH_Complete=1&_sop=13`;
  const onepointUrl = `https://130point.com/sales/?query=${encodeURIComponent(
    compsQuery
  )}`;
  const psaCertUrl = card.cert_number
    ? `https://www.psacard.com/cert/${encodeURIComponent(card.cert_number)}`
    : null;

  return (
    <>
      <main className="min-h-screen bg-[#090B0D] text-[#E6E8EB]">
        <div className="mx-auto max-w-5xl px-4 py-6">
          <Link
            href="/marketplace"
            className="text-[12px] text-[#77808C] hover:text-[#E6E8EB]"
          >
            ← Marketplace
          </Link>

          {/* Header */}
          <header className="mt-3 flex flex-wrap items-start justify-between gap-3 border-b border-[#24282D] pb-4">
            <div className="min-w-0">
              <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-[#77808C]">
                Listing
              </div>
              <h1 className="mt-0.5 truncate text-[22px] font-semibold text-[#E6E8EB]">
                {card.player}
              </h1>
              <div className="mt-1 text-[12px] text-[#B8C0CC]">
                {[card.year, card.title, card.parallel]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            </div>
            <span
              className={`shrink-0 border px-2 py-0.5 text-[10px] uppercase tracking-wide ${
                PIPELINE_CHIP[listing.pipeline] ?? PIPELINE_CHIP.standard
              }`}
            >
              {listing.pipeline}
            </span>
          </header>

          {/* Body grid */}
          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
            {/* Left: card details */}
            <section className="border border-[#24282D] bg-[#0F1317] p-5">
              {/* Card photo */}
              <div className="mb-5 flex justify-center border border-[#24282D] bg-[#0B0D0F] p-4">
                {card.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={card.image_url}
                    alt={`${card.player} ${card.year} ${card.title}`.trim()}
                    className="max-h-[420px] w-auto object-contain"
                  />
                ) : (
                  <div className="flex aspect-[5/7] w-full max-w-[300px] items-center justify-center text-[10px] uppercase tracking-wide text-[#3A414B]">
                    No image provided
                  </div>
                )}
              </div>

              <h2 className="text-[10px] font-semibold uppercase tracking-wide text-[#77808C]">
                Card details
              </h2>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
                <DetailRow label="Player" value={card.player} />
                <DetailRow label="Year" value={String(card.year)} />
                <DetailRow label="Set" value={card.title} />
                <DetailRow
                  label="Parallel"
                  value={card.parallel ?? "—"}
                />
                <DetailRow
                  label="Grading"
                  value={`${card.grading_service} ${card.grade}`}
                />
                <DetailRow label="Cert #" value={card.cert_number ?? "—"} />
                <DetailRow
                  label="Listed"
                  value={new Date(listing.listed_at).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                />
                <DetailRow
                  label="Mode"
                  value={
                    listing.mode === "self_serve" ? "Self-serve" : "Full-service"
                  }
                />
              </dl>

              <h2 className="mt-5 text-[10px] font-semibold uppercase tracking-wide text-[#77808C]">
                Check recent comps
              </h2>
              <p className="mt-2 text-[11px] leading-relaxed text-[#B8C0CC]">
                We don&apos;t publish our own valuation for this card. Pricing is
                set by the seller — use the links below to review recent sold
                comps and decide what it&apos;s worth to you.
              </p>
              <div className="mt-3 grid gap-2">
                <CompLink
                  href={ebaySoldUrl}
                  label="eBay — recent sold listings"
                  sub="Sold &amp; completed, newest first"
                />
                <CompLink
                  href={onepointUrl}
                  label="130point — sales search"
                  sub="Aggregated eBay &amp; auction sales"
                />
                {psaCertUrl ? (
                  <CompLink
                    href={psaCertUrl}
                    label={`PSA — verify cert #${card.cert_number}`}
                    sub="Confirm the grade on PSA&apos;s registry"
                  />
                ) : null}
              </div>
              <p className="mt-3 text-[10px] leading-relaxed text-[#5A626E]">
                Comps open on third-party sites in a new tab. Sold prices vary by
                condition, timing, and sale type — treat them as a reference, not
                a guarantee.
              </p>
            </section>

            {/* Right: price + buy */}
            <aside className="border border-[#24282D] bg-[#0F1317]">
              <div className="border-b border-[#24282D] px-5 py-5">
                <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-[#77808C]">
                  Price
                </div>
                <div className="mt-1 flex items-baseline gap-3">
                  <div className="text-[32px] font-semibold tabular-nums text-[#E6E8EB]">
                    {fmtCents(listCents)}
                  </div>
                  <div className="text-[10px] text-[#5A626E]">
                    Seller-set price
                  </div>
                </div>
                {listing.status === "price_reduced" ? (
                  <div className="mt-2 inline-flex border border-amber-500/40 bg-amber-900/20 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-amber-300">
                    Price reduced · Day-30
                  </div>
                ) : null}

                {/* Price breakdown */}
                <dl className="mt-4 space-y-1 text-[12px]">
                  <div className="flex items-center justify-between">
                    <dt className="text-[#77808C]">Card</dt>
                    <dd className="tabular-nums text-[#B8C0CC]">{fmtCents(listCents)}</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-[#77808C]">Shipping &amp; tracking</dt>
                    <dd className="tabular-nums text-[#B8C0CC]">
                      {shippingCents > 0 ? fmtCents(shippingCents) : "Free"}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between border-t border-[#24282D] pt-1">
                    <dt className="text-[#E6E8EB]">You pay</dt>
                    <dd className="tabular-nums font-semibold text-[#E6E8EB]">
                      {fmtCents(listCents + shippingCents)}
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="border-b border-[#24282D] px-5 py-4 text-[11px] text-[#B8C0CC] leading-relaxed">
                Secure checkout by Stripe. The platform fee is paid by the seller.
                Your card ships with tracking — confirm delivery when it arrives.
              </div>

              <div className="space-y-2 px-5 py-4">
                <BuyButton
                  listingId={listing.id}
                  isLoggedIn={!!user}
                  isOwnListing={!!user && user.id === listing.seller_id}
                  sellerReady={sellerReady}
                />
                <MessageSellerButton
                  listingId={listing.id}
                  isLoggedIn={!!user}
                  isOwnListing={!!user && user.id === listing.seller_id}
                />
              </div>
            </aside>
          </div>
        </div>
      </main>
    </>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-[#77808C]">{label}</dt>
      <dd className="text-right text-[#E6E8EB]">{value}</dd>
    </>
  );
}

function CompLink({
  href,
  label,
  sub,
}: {
  href: string;
  label: string;
  sub: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-center justify-between border border-[#24282D] bg-[#0B0D0F] px-3 py-2.5 transition-colors hover:border-[#5A626E]"
    >
      <span className="min-w-0">
        <span className="block truncate text-[12px] text-[#E6E8EB] group-hover:underline">
          {label}
        </span>
        <span className="block truncate text-[10px] text-[#77808C]">{sub}</span>
      </span>
      <span className="ml-3 shrink-0 text-[12px] text-[#5A626E] group-hover:text-[#B8C0CC]">
        ↗
      </span>
    </a>
  );
}
