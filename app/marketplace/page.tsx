import type { ReactNode } from "react";
import Link from "next/link";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Filters = {
  player?: string;
  manufacturer?: string;
  grade?: string;
  pipeline?: string;
  min_price?: string;
  max_price?: string;
};

interface ListingRow {
  id: string;
  list_price_cents: number;
  cmv_mid_cents: number | null;
  pipeline: "standard" | "elite" | "grails";
  status: "active" | "price_reduced";
  listed_at: string;
  marketplace_cards: {
    title: string;
    year: number;
    player: string;
    grade: string;
    grading_service: string;
    manufacturer: string;
    parallel: string | null;
  };
}

type AuthUserSummary = {
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
};

const PIPELINES = ["standard", "elite", "grails"] as const;

const MONEY = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function formatMoneyCents(cents: number | null): string {
  if (cents == null) return "—";
  return MONEY.format(cents / 100);
}

function relativeListed(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const days = Math.floor(ms / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "1d ago";
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function spreadVsCmv(listCents: number, cmvCents: number | null): {
  pctText: string;
  toneClass: string;
} {
  if (cmvCents == null || cmvCents <= 0) {
    return { pctText: "—", toneClass: "text-[#5A626E]" };
  }
  const pct = ((listCents - cmvCents) / cmvCents) * 100;
  const rounded = Math.round(pct * 10) / 10;
  const sign = rounded > 0 ? "+" : "";
  const tone =
    rounded > 5
      ? "text-[#E05C5C]" // overpriced vs CMV
      : rounded < -5
        ? "text-[#20B26B]" // bargain vs CMV
        : "text-[#B8C0CC]";
  return { pctText: `${sign}${rounded.toFixed(1)}%`, toneClass: tone };
}

function getStringMetadata(
  metadata: Record<string, unknown> | null | undefined,
  key: string
): string | null {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function usernameFromEmail(email?: string | null): string | null {
  if (!email) return null;
  const username = email.split("@")[0]?.trim();
  return username || null;
}

function titleCaseUsername(username: string): string {
  return username
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function displayNameForUser(user: AuthUserSummary): string {
  const metadataName =
    getStringMetadata(user.user_metadata, "full_name") ??
    getStringMetadata(user.user_metadata, "name") ??
    getStringMetadata(user.user_metadata, "display_name");
  if (metadataName) return metadataName;

  const username = usernameFromEmail(user.email);
  return username ? titleCaseUsername(username) : "Marketplace member";
}

function initialsForUser(displayName: string, email?: string | null): string {
  const nameParts = displayName.split(/\s+/).filter(Boolean);
  if (nameParts.length >= 2) {
    return `${nameParts[0][0]}${nameParts[1][0]}`.toUpperCase();
  }

  const source = nameParts[0] ?? usernameFromEmail(email) ?? "M";
  return source.slice(0, 2).toUpperCase();
}

const PIPELINE_CHIP: Record<ListingRow["pipeline"], string> = {
  standard: "border-[#343941] text-[#B8C0CC] bg-[#0B0D0F]",
  elite: "border-purple-500/40 text-purple-300 bg-purple-900/20",
  grails: "border-amber-500/40 text-amber-300 bg-amber-900/20",
};

export default async function MarketplaceBrowsePage({
  searchParams,
}: {
  searchParams: Promise<Filters>;
}) {
  const filters = await searchParams;
  const supabase = await createClient();
  const service = await createServiceClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profileRow } = user
    ? await supabase.from("users").select("name").eq("id", user.id).maybeSingle()
    : { data: null };
  const profileName =
    typeof (profileRow as { name?: unknown } | null)?.name === "string"
      ? ((profileRow as { name: string }).name.trim() || null)
      : null;

  let query = service
    .from("listings")
    .select(
      "id, list_price_cents, cmv_mid_cents, pipeline, status, listed_at, marketplace_cards!inner(title, year, player, grade, grading_service, manufacturer, parallel)"
    )
    .in("status", ["active", "price_reduced"])
    .order("listed_at", { ascending: false })
    .limit(120);

  if (filters.player) {
    query = query.ilike("marketplace_cards.player", `%${filters.player}%`);
  }
  if (filters.manufacturer && filters.manufacturer !== "all") {
    query = query.eq("marketplace_cards.manufacturer", filters.manufacturer);
  }
  if (filters.grade) {
    query = query.eq("marketplace_cards.grade", filters.grade);
  }
  if (filters.pipeline && PIPELINES.includes(filters.pipeline as typeof PIPELINES[number])) {
    query = query.eq("pipeline", filters.pipeline);
  }
  if (filters.min_price) {
    const min = Math.round(Number(filters.min_price) * 100);
    if (Number.isFinite(min)) query = query.gte("list_price_cents", min);
  }
  if (filters.max_price) {
    const max = Math.round(Number(filters.max_price) * 100);
    if (Number.isFinite(max)) query = query.lte("list_price_cents", max);
  }

  const { data, error } = await query;
  const rows = (data ?? []) as unknown as ListingRow[];

  return (
    <>
      <main className="min-h-screen bg-[#090B0D] text-[#E6E8EB]">
        {/* Header */}
        <header className="relative overflow-visible border-b border-[#24282D] bg-black px-4 pb-9 pt-12 text-center sm:pb-11 sm:pt-14">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-[linear-gradient(180deg,rgba(255,255,255,0.14),rgba(255,255,255,0.03)_42%,rgba(255,255,255,0)_100%)]" />
          <div className="absolute right-4 top-4 z-20">
            {user ? (
              <MarketplaceProfileMenu user={user} profileName={profileName} />
            ) : (
              <Link
                href="/login?redirect=/marketplace"
                className="inline-flex h-8 items-center border border-[#343941] bg-[#0F1317]/90 px-2.5 text-[12px] font-semibold text-[#B8C0CC] shadow-[0_0_18px_rgba(255,255,255,0.05)] backdrop-blur hover:border-[#5A626E] hover:text-[#F4F6F8]"
              >
                Sign in
              </Link>
            )}
          </div>
          <h1 className="relative text-center text-[28px] font-semibold uppercase text-[#F4F6F8] [text-shadow:0_1px_0_rgba(255,255,255,0.35),0_0_18px_rgba(255,255,255,0.18),0_2px_10px_rgba(0,0,0,0.85)] sm:text-[40px] lg:text-[52px]">
            CardzCheck Marketplace
          </h1>
        </header>

        {/* Filter strip */}
        <FilterBar filters={filters} />

        {/* Body */}
        <section className="mx-auto max-w-7xl px-4 py-4">
          {error ? (
            <div className="border border-red-800/50 bg-red-950/40 p-3 text-[12px] text-red-200">
              {error.message}
            </div>
          ) : null}

          {rows.length === 0 ? (
            <div className="border border-dashed border-[#24282D] bg-[#0B0D0F] p-10 text-center text-[12px] text-[#77808C]">
              No listings match your filters.
            </div>
          ) : (
            <div className="overflow-hidden border border-[#24282D] bg-[#0F1317]">
              <div className="max-h-[calc(100vh-220px)] min-h-[400px] overflow-auto">
                <table className="w-full border-collapse font-data text-[12px]">
                  <thead>
                    <tr>
                      <Th>Card</Th>
                      <Th className="w-[80px]">Grade</Th>
                      <Th align="right" className="w-[100px]">
                        Price
                      </Th>
                      <Th align="right" className="w-[82px]" title="Spread vs CMV mid">
                        Spread
                      </Th>
                      <Th align="right" className="w-[84px]" title="CMV mid reference">
                        CMV
                      </Th>
                      <Th align="center" className="w-[90px]">
                        Tier
                      </Th>
                      <Th align="right" className="w-[80px]">
                        Listed
                      </Th>
                      <Th align="right" className="w-[80px]">
                        Action
                      </Th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const card = r.marketplace_cards;
                      const spread = spreadVsCmv(r.list_price_cents, r.cmv_mid_cents);
                      return (
                        <tr
                          key={r.id}
                          className="group border-b border-[#1A1E23] transition-colors hover:bg-[#161A1F]"
                        >
                          <Td className="max-w-[280px]">
                            <Link
                              href={`/marketplace/listing/${r.id}`}
                              className="block min-w-0 truncate"
                            >
                              <div className="truncate font-medium text-[#E6E8EB] group-hover:underline">
                                {card.player}
                              </div>
                              <div className="mt-0.5 truncate text-[10px] text-[#77808C]">
                                {[
                                  card.year,
                                  card.manufacturer,
                                  card.parallel,
                                ]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </div>
                            </Link>
                          </Td>
                          <Td>
                            <span className="text-[#B8C0CC]">
                              {card.grading_service} {card.grade}
                            </span>
                          </Td>
                          <Td align="right" className="font-semibold tabular-nums text-[#E6E8EB]">
                            {formatMoneyCents(r.list_price_cents)}
                            {r.status === "price_reduced" ? (
                              <div className="text-[9px] uppercase text-amber-300">
                                Reduced
                              </div>
                            ) : null}
                          </Td>
                          <Td
                            align="right"
                            className={`tabular-nums ${spread.toneClass}`}
                          >
                            {spread.pctText}
                          </Td>
                          <Td align="right" className="tabular-nums text-[#77808C]">
                            {formatMoneyCents(r.cmv_mid_cents)}
                          </Td>
                          <Td align="center">
                            <span
                              className={`inline-flex border px-1.5 py-0.5 text-[9px] uppercase ${PIPELINE_CHIP[r.pipeline]}`}
                            >
                              {r.pipeline}
                            </span>
                          </Td>
                          <Td align="right" className="text-[10px] text-[#77808C]">
                            {relativeListed(r.listed_at)}
                          </Td>
                          <Td align="right">
                            <Link
                              href={`/marketplace/listing/${r.id}`}
                              className="inline-flex border border-[#343941] bg-[#0B0D0F] px-2 py-0.5 text-[10px] font-semibold uppercase text-[#B8C0CC] hover:border-[#5A626E] hover:text-[#E6E8EB]"
                            >
                              View
                            </Link>
                          </Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      </main>
    </>
  );
}

function MarketplaceProfileMenu({
  user,
  profileName,
}: {
  user: AuthUserSummary;
  profileName: string | null;
}) {
  const displayName = profileName ?? displayNameForUser(user);
  const initials = initialsForUser(displayName, user.email);

  return (
    <details className="group relative text-left">
      <summary className="flex h-8 cursor-pointer list-none items-center gap-2 border border-[#343941] bg-[#0F1317]/90 px-2 pr-2.5 text-[12px] font-semibold text-[#E6E8EB] shadow-[0_0_18px_rgba(255,255,255,0.05)] backdrop-blur transition-colors hover:border-[#5A626E]">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#1D5FD1] text-[10px] font-semibold text-white">
          {initials}
        </span>
        <span className="hidden sm:inline">Profile</span>
      </summary>

      <div className="absolute right-0 mt-2 w-[min(calc(100vw-2rem),300px)] overflow-hidden border border-[#24282D] bg-[#090B0D] text-[#E6E8EB] shadow-2xl">
        <div className="border-b border-[#1A1E23] bg-[#0F1317] p-3">
          <div className="flex items-start gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#1D5FD1] text-[12px] font-semibold text-white">
              {initials}
            </div>
            <div className="min-w-0 pt-0.5">
              <div className="truncate text-[13px] font-semibold text-[#F4F6F8]">
                {displayName}
              </div>
              <div className="mt-0.5 text-[11px] text-[#77808C]">
                Marketplace profile
              </div>
            </div>
          </div>
        </div>

        <nav className="bg-[#090B0D] p-1.5">
          <MarketplaceMenuItem
            href="/marketplace/profile?tab=purchases"
            icon={<OrdersIcon />}
            title="Purchases"
            description="Recent orders and delivery status"
          />
          <MarketplaceMenuItem
            href="/marketplace/profile?tab=watchlist"
            icon={<HeartIcon />}
            title="Watchlist"
            description="Saved marketplace cards"
          />
          <MarketplaceMenuItem
            href="/marketplace/profile?tab=offers"
            icon={<OfferIcon />}
            title="Offers"
            description="Offers sent and received"
          />
          <MarketplaceMenuItem
            href="/marketplace/profile?tab=selling"
            icon={<TagIcon />}
            title="Selling"
            description="Monitor active listings, sales, watchers, and carts"
          />
        </nav>
      </div>
    </details>
  );
}

function MarketplaceMenuItem({
  href,
  icon,
  title,
  description,
}: {
  href: string;
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2.5 px-2.5 py-2 transition-colors hover:bg-[#12161B]"
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center border border-[#24282D] bg-[#0F1317] text-[#B8C0CC]">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[12px] font-semibold text-[#E6E8EB]">
          {title}
        </span>
        <span className="mt-0.5 block truncate text-[10px] text-[#77808C]">
          {description}
        </span>
      </span>
    </Link>
  );
}

function OrdersIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h10M7 11h10M7 15h6" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 3h12a2 2 0 0 1 2 2v14l-3-2-3 2-3-2-3 2-3-2V5a2 2 0 0 1 2-2Z" />
    </svg>
  );
}

function HeartIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.8 8.6c0 5.2-8.8 10.4-8.8 10.4S3.2 13.8 3.2 8.6A4.6 4.6 0 0 1 12 6.7a4.6 4.6 0 0 1 8.8 1.9Z" />
    </svg>
  );
}

function OfferIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8.5A2.5 2.5 0 0 1 6.5 6H18a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6.5A2.5 2.5 0 0 1 4 15.5v-7Z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h4m-4 4h8m1-4h.01" />
    </svg>
  );
}

function TagIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13 11 4H5v6l9 9a2.8 2.8 0 0 0 4 0l2-2a2.8 2.8 0 0 0 0-4Z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 8h.01" />
    </svg>
  );
}

function Th({
  children,
  align = "left",
  className = "",
  title,
}: {
  children: ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
  title?: string;
}) {
  const alignClass =
    align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
  return (
    <th
      scope="col"
      title={title}
      className={`sticky top-0 z-10 border-b border-[#24282D] bg-[#0B0D0F] px-2 py-2 text-[10px] font-medium uppercase text-[#77808C] ${alignClass} ${className}`}
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
    <td className={`px-2 py-1.5 align-middle leading-snug ${alignClass} ${className}`}>
      {children}
    </td>
  );
}

function FilterBar({ filters }: { filters: Filters }) {
  return (
    <form
      method="get"
      className="border-b border-[#24282D] bg-[#0B0D0F] px-4 py-2"
    >
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2">
        <input
          name="player"
          defaultValue={filters.player ?? ""}
          placeholder="Player"
          className="border border-[#24282D] bg-[#0F1317] px-2 py-1 text-[12px] text-[#E6E8EB] placeholder:text-[#5A626E] focus:border-[#5A626E] focus:outline-none"
        />
        <select
          name="manufacturer"
          defaultValue={filters.manufacturer ?? "all"}
          className="border border-[#24282D] bg-[#0F1317] px-2 py-1 text-[12px] text-[#E6E8EB] focus:border-[#5A626E] focus:outline-none"
        >
          <option value="all">All manufacturers</option>
          <option value="topps">Topps</option>
          <option value="panini">Panini</option>
        </select>
        <input
          name="grade"
          defaultValue={filters.grade ?? ""}
          placeholder="Grade"
          className="w-[88px] border border-[#24282D] bg-[#0F1317] px-2 py-1 text-[12px] text-[#E6E8EB] placeholder:text-[#5A626E] focus:border-[#5A626E] focus:outline-none"
        />
        <select
          name="pipeline"
          defaultValue={filters.pipeline ?? ""}
          className="border border-[#24282D] bg-[#0F1317] px-2 py-1 text-[12px] text-[#E6E8EB] focus:border-[#5A626E] focus:outline-none"
        >
          <option value="">All tiers</option>
          <option value="standard">Standard</option>
          <option value="elite">Elite</option>
          <option value="grails">Grails</option>
        </select>
        <input
          name="min_price"
          type="number"
          defaultValue={filters.min_price ?? ""}
          placeholder="Min $"
          className="w-[88px] border border-[#24282D] bg-[#0F1317] px-2 py-1 text-[12px] text-[#E6E8EB] placeholder:text-[#5A626E] focus:border-[#5A626E] focus:outline-none"
        />
        <input
          name="max_price"
          type="number"
          defaultValue={filters.max_price ?? ""}
          placeholder="Max $"
          className="w-[88px] border border-[#24282D] bg-[#0F1317] px-2 py-1 text-[12px] text-[#E6E8EB] placeholder:text-[#5A626E] focus:border-[#5A626E] focus:outline-none"
        />
        <button
          type="submit"
          className="border border-[#343941] bg-[#0F1317] px-3 py-1 text-[12px] font-medium text-[#B8C0CC] hover:border-[#5A626E] hover:text-[#E6E8EB]"
        >
          Apply
        </button>
        <Link
          href="/marketplace"
          className="text-[11px] text-[#77808C] hover:text-[#E6E8EB]"
        >
          Reset
        </Link>
      </div>
    </form>
  );
}
