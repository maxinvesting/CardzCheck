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
      "id, status, list_price_cents, cmv_low_cents, cmv_mid_cents, cmv_high_cents, pipeline, mode, seller_id, listed_at, marketplace_cards!inner(title, year, player, grade, grading_service, cert_number, parallel)"
    )
    .eq("id", id)
    .single();

  if (!listing) notFound();

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
    };
  }).marketplace_cards;

  const cmvMid = (listing as { cmv_mid_cents: number | null }).cmv_mid_cents;
  const cmvLow = (listing as { cmv_low_cents: number | null }).cmv_low_cents;
  const cmvHigh = (listing as { cmv_high_cents: number | null }).cmv_high_cents;

  // Spread vs CMV mid — same logic as the browse table for consistency.
  const listCents = listing.list_price_cents;
  const spread =
    cmvMid && cmvMid > 0 ? ((listCents - cmvMid) / cmvMid) * 100 : null;
  const spreadText =
    spread == null
      ? "—"
      : `${spread > 0 ? "+" : ""}${(Math.round(spread * 10) / 10).toFixed(1)}%`;
  const spreadTone =
    spread == null
      ? "text-[#5A626E]"
      : spread > 5
        ? "text-[#E05C5C]"
        : spread < -5
          ? "text-[#20B26B]"
          : "text-[#B8C0CC]";

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
                Market reference
              </h2>
              <div className="mt-2 grid grid-cols-3 border border-[#24282D]">
                <CmvCell label="CMV low" value={fmtCents(cmvLow)} />
                <CmvCell
                  label="CMV mid"
                  value={fmtCents(cmvMid)}
                  emphasis
                />
                <CmvCell label="CMV high" value={fmtCents(cmvHigh)} />
              </div>
              <p className="mt-2 text-[10px] text-[#5A626E]">
                CMV pulled from recent eBay sold comps. Spread shown on the
                price card is list vs. CMV mid.
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
                  <div className={`text-[12px] tabular-nums ${spreadTone}`}>
                    {spreadText}{" "}
                    <span className="text-[10px] text-[#5A626E]">vs CMV</span>
                  </div>
                </div>
                {listing.status === "price_reduced" ? (
                  <div className="mt-2 inline-flex border border-amber-500/40 bg-amber-900/20 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-amber-300">
                    Price reduced · Day-30
                  </div>
                ) : null}
              </div>

              <div className="border-b border-[#24282D] px-5 py-4 text-[11px] text-[#B8C0CC] leading-relaxed">
                Buyer protection: payment held until you confirm delivery.
                Platform fee is paid by the seller — your card price is what
                you pay.
              </div>

              <div className="space-y-2 px-5 py-4">
                <BuyButton
                  listingId={listing.id}
                  isLoggedIn={!!user}
                  isOwnListing={!!user && user.id === listing.seller_id}
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

function CmvCell({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div
      className={`px-3 py-2 border-l first:border-l-0 border-[#24282D] ${
        emphasis ? "bg-[#0B1A12]" : "bg-[#0B0D0F]"
      }`}
    >
      <div className="text-[10px] uppercase tracking-wide text-[#77808C]">
        {label}
      </div>
      <div
        className={`mt-0.5 tabular-nums ${emphasis ? "text-[#20B26B] font-semibold" : "text-[#E6E8EB]"}`}
      >
        {value}
      </div>
    </div>
  );
}
