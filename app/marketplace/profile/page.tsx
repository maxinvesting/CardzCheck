import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type PurchaseRow = {
  id: string;
  listing_id: string;
  sale_price_cents: number;
  shipping_cents: number;
  fulfillment_status: "paid" | "label_created" | "shipped" | "delivered" | "canceled";
  completed_at: string;
  listings: {
    id: string;
    marketplace_cards: {
      title: string;
      player: string;
      year: number;
      grade: string;
      grading_service: string;
    };
  };
};

type CurrentListingRow = {
  id: string;
  status: "active" | "price_reduced";
  list_price_cents: number;
  cmv_mid_cents: number | null;
  pipeline: "standard" | "elite" | "grails";
  listed_at: string;
  marketplace_cards: {
    title: string;
    player: string;
    year: number;
    grade: string;
    grading_service: string;
  };
};

type ProfileFilters = {
  tab?: string;
};

type ProfileTab = "purchases" | "watchlist" | "offers" | "selling";

const MONEY = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const FULFILLMENT_LABEL: Record<PurchaseRow["fulfillment_status"], string> = {
  paid: "Paid",
  label_created: "Label created",
  shipped: "Shipped",
  delivered: "Delivered",
  canceled: "Canceled",
};

const STATUS_CLASS: Record<CurrentListingRow["status"], string> = {
  active: "border-emerald-500/40 bg-emerald-900/20 text-emerald-300",
  price_reduced: "border-amber-500/40 bg-amber-900/20 text-amber-300",
};

const PROFILE_TABS: Array<{
  key: ProfileTab;
  label: string;
  description: string;
}> = [
  {
    key: "purchases",
    label: "Purchases",
    description: "Orders and delivery status",
  },
  {
    key: "watchlist",
    label: "Watchlist",
    description: "Saved marketplace cards",
  },
  {
    key: "offers",
    label: "Offers",
    description: "Sent and received offers",
  },
  {
    key: "selling",
    label: "Selling",
    description: "Listings, sales, watchers, and carts",
  },
];

function money(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return MONEY.format(cents / 100);
}

function compactDate(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function resolveProfileTab(tab: string | undefined): ProfileTab {
  return PROFILE_TABS.some((item) => item.key === tab)
    ? (tab as ProfileTab)
    : "purchases";
}

export default async function MarketplaceProfilePage({
  searchParams,
}: {
  searchParams: Promise<ProfileFilters>;
}) {
  const filters = await searchParams;
  const activeTab = resolveProfileTab(filters.tab);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(
      `/login?redirect=${encodeURIComponent(`/marketplace/profile?tab=${activeTab}`)}`
    );
  }

  const service = await createServiceClient();
  const [
    purchasesResult,
    purchasesCountResult,
    listingsResult,
    listingsCountResult,
  ] = await Promise.all([
    service
      .from("transactions")
      .select(
        `id, listing_id, sale_price_cents, shipping_cents, fulfillment_status, completed_at,
         listings!inner(id, marketplace_cards!inner(title, player, year, grade, grading_service))`
      )
      .eq("buyer_id", user.id)
      .order("completed_at", { ascending: false })
      .limit(5),
    service
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("buyer_id", user.id),
    service
      .from("listings")
      .select(
        "id, status, list_price_cents, cmv_mid_cents, pipeline, listed_at, marketplace_cards!inner(title, player, year, grade, grading_service)"
      )
      .eq("seller_id", user.id)
      .in("status", ["active", "price_reduced"])
      .order("listed_at", { ascending: false })
      .limit(8),
    service
      .from("listings")
      .select("id", { count: "exact", head: true })
      .eq("seller_id", user.id)
      .in("status", ["active", "price_reduced"]),
  ]);

  const purchases = (purchasesResult.data ?? []) as unknown as PurchaseRow[];
  const listings = (listingsResult.data ?? []) as unknown as CurrentListingRow[];
  const purchaseCount = purchasesCountResult.count ?? purchases.length;
  const listingCount = listingsCountResult.count ?? listings.length;
  const watchersCount = 0;
  const inCartsCount = 0;
  const queryError =
    purchasesResult.error?.message ??
    purchasesCountResult.error?.message ??
    listingsResult.error?.message ??
    listingsCountResult.error?.message;

  return (
    <main className="min-h-screen bg-[#090B0D] text-[#E6E8EB]">
      <div className="mx-auto max-w-7xl px-4 py-5">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[#24282D] pb-3">
          <div>
            <Link
              href="/marketplace"
              className="mb-2 inline-flex items-center gap-1.5 border border-[#343941] bg-[#0F1317] px-2.5 py-1 text-[11px] font-semibold text-[#B8C0CC] transition-colors hover:border-[#5A626E] hover:text-[#E6E8EB]"
              aria-label="Back to marketplace"
            >
              <span aria-hidden="true">&larr;</span>
              Back to marketplace
            </Link>
            <div className="text-[10px] font-medium uppercase text-[#77808C]">
              Marketplace
            </div>
            <h1 className="mt-1 text-[20px] font-semibold">
              Marketplace profile
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/marketplace"
              className="border border-[#343941] bg-[#0F1317] px-3 py-1.5 text-[12px] font-semibold text-[#B8C0CC] hover:border-[#5A626E] hover:text-[#E6E8EB]"
            >
              Browse
            </Link>
            <Link
              href="/marketplace/messages"
              className="border border-[#343941] bg-[#0F1317] px-3 py-1.5 text-[12px] font-semibold text-[#B8C0CC] hover:border-[#5A626E] hover:text-[#E6E8EB]"
            >
              Messages
            </Link>
          </div>
        </header>

        <ProfileTabs
          activeTab={activeTab}
          counts={{
            purchases: purchaseCount,
            watchlist: 0,
            offers: 0,
            selling: listingCount,
          }}
        />

        {queryError ? (
          <div className="mt-4 border border-red-800/50 bg-red-950/40 p-3 text-[12px] text-red-200">
            {queryError}
          </div>
        ) : null}

        <section className="mt-4">
          {activeTab === "purchases" ? (
            <PurchasesPanel purchases={purchases} />
          ) : activeTab === "watchlist" ? (
            <EmptyFeaturePanel
              title="Watchlist"
              message="Saved marketplace cards will appear here when marketplace saves are enabled."
            />
          ) : activeTab === "offers" ? (
            <EmptyFeaturePanel
              title="Offers"
              message="Offers you send or receive on marketplace listings will appear here."
            />
          ) : (
            <SellingPanel listings={listings} watchersCount={watchersCount} inCartsCount={inCartsCount} />
          )}
        </section>
      </div>
    </main>
  );
}

function ProfileTabs({
  activeTab,
  counts,
}: {
  activeTab: ProfileTab;
  counts: Record<ProfileTab, number>;
}) {
  return (
    <nav className="mt-3 flex flex-wrap gap-1 border-b border-[#24282D] pb-2">
      {PROFILE_TABS.map((tab) => {
        const active = tab.key === activeTab;
        return (
          <Link
            key={tab.key}
            href={`/marketplace/profile?tab=${tab.key}`}
            className={`border px-3 py-1.5 text-[12px] font-semibold transition-colors ${
              active
                ? "border-[#5A626E] bg-[#161A1F] text-[#F4F6F8]"
                : "border-[#24282D] bg-[#0F1317] text-[#B8C0CC] hover:border-[#343941] hover:text-[#E6E8EB]"
            }`}
          >
            {tab.label}
            <span className="ml-2 font-data text-[11px] text-[#77808C]">
              {counts[tab.key].toLocaleString()}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

function PurchasesPanel({ purchases }: { purchases: PurchaseRow[] }) {
  return (
    <div className="border border-[#24282D] bg-[#0F1317]">
      <SectionHeader
        title="Purchases"
        count={purchases.length}
        href="/marketplace/orders"
        action="All orders"
      />
      {purchases.length === 0 ? (
        <EmptyState>
          Purchases you make on the marketplace will show up here.
        </EmptyState>
      ) : (
        <div className="divide-y divide-[#1A1E23]">
          {purchases.map((purchase) => {
            const card = purchase.listings.marketplace_cards;
            return (
              <Link
                key={purchase.id}
                href="/marketplace/orders"
                className="block px-4 py-3 transition-colors hover:bg-[#161A1F]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-semibold">
                      {card.player} · {card.year}
                    </div>
                    <div className="mt-0.5 truncate text-[11px] text-[#77808C]">
                      {card.title} · {card.grading_service} {card.grade}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-data text-[12px] font-semibold">
                      {money(purchase.sale_price_cents + purchase.shipping_cents)}
                    </div>
                    <div className="mt-0.5 text-[10px] text-[#77808C]">
                      {compactDate(purchase.completed_at)}
                    </div>
                  </div>
                </div>
                <div className="mt-2 inline-flex border border-[#343941] px-2 py-0.5 text-[10px] uppercase text-[#B8C0CC]">
                  {FULFILLMENT_LABEL[purchase.fulfillment_status] ??
                    purchase.fulfillment_status}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SellingPanel({
  listings,
  watchersCount,
  inCartsCount,
}: {
  listings: CurrentListingRow[];
  watchersCount: number;
  inCartsCount: number;
}) {
  return (
    <div className="border border-[#24282D] bg-[#0F1317]">
      <SectionHeader
        title="Selling"
        count={listings.length}
        href="/marketplace/sell/listings"
        action="Manage"
      />
      {listings.length === 0 ? (
        <EmptyState>
          Your live listings will appear here after you list cards from the ledger.
          <div className="mt-3">
            <Link href="/business/ledger" className="text-emerald-300 hover:underline">
              Open ledger
            </Link>
          </div>
        </EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse font-data text-[12px]">
            <thead>
              <tr className="border-b border-[#24282D] bg-[#0B0D0F]">
                <Th>Card</Th>
                <Th align="right">Price</Th>
                <Th align="center">Watchers</Th>
                <Th align="center">In carts</Th>
                <Th align="center">Status</Th>
              </tr>
            </thead>
            <tbody>
              {listings.map((listing) => {
                const card = listing.marketplace_cards;
                return (
                  <tr
                    key={listing.id}
                    className="border-b border-[#1A1E23] transition-colors hover:bg-[#161A1F]"
                  >
                    <Td className="max-w-[280px]">
                      <Link href={`/marketplace/listing/${listing.id}`} className="block">
                        <div className="truncate font-semibold text-[#E6E8EB]">
                          {card.player} · {card.year}
                        </div>
                        <div className="mt-0.5 truncate text-[10px] text-[#77808C]">
                          {card.title} · {card.grading_service} {card.grade} ·{" "}
                          {compactDate(listing.listed_at)}
                        </div>
                      </Link>
                    </Td>
                    <Td align="right" className="font-semibold">
                      {money(listing.list_price_cents)}
                    </Td>
                    <Td align="center">0</Td>
                    <Td align="center">0</Td>
                    <Td align="center">
                      <span
                        className={`inline-flex border px-2 py-0.5 text-[10px] uppercase ${
                          STATUS_CLASS[listing.status]
                        }`}
                      >
                        {listing.status.replace("_", " ")}
                      </span>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="border-t border-[#24282D] bg-[#0B0D0F] px-4 py-3 text-[12px] text-[#77808C]">
        {watchersCount} watchers · {inCartsCount} in carts
      </div>
    </div>
  );
}

function EmptyFeaturePanel({ title, message }: { title: string; message: string }) {
  return (
    <div className="border border-[#24282D] bg-[#0F1317]">
      <div className="border-b border-[#24282D] px-4 py-3">
        <h2 className="text-[14px] font-semibold">{title}</h2>
        <div className="mt-0.5 text-[11px] text-[#77808C]">0 shown</div>
      </div>
      <EmptyState>{message}</EmptyState>
    </div>
  );
}

function SectionHeader({
  title,
  count,
  href,
  action,
}: {
  title: string;
  count: number;
  href: string;
  action: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[#24282D] px-4 py-3">
      <div>
        <h2 className="text-[14px] font-semibold">{title}</h2>
        <div className="mt-0.5 text-[11px] text-[#77808C]">
          {count} shown
        </div>
      </div>
      <Link href={href} className="text-[11px] font-semibold text-[#B8C0CC] hover:text-white">
        {action}
      </Link>
    </div>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="px-4 py-10 text-center text-[12px] leading-5 text-[#77808C]">
      {children}
    </div>
  );
}

function Th({
  children,
  align = "left",
}: {
  children: ReactNode;
  align?: "left" | "right" | "center";
}) {
  const alignClass =
    align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
  return (
    <th
      scope="col"
      className={`px-3 py-2 text-[10px] font-semibold uppercase text-[#77808C] ${alignClass}`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = "left",
  className = "",
}: {
  children: ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
}) {
  const alignClass =
    align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
  return (
    <td className={`px-3 py-2 align-middle leading-snug text-[#B8C0CC] ${alignClass} ${className}`}>
      {children}
    </td>
  );
}
