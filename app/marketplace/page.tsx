import Link from "next/link";
import AuthenticatedLayout from "@/components/AuthenticatedLayout";
import { createServiceClient } from "@/lib/supabase/server";

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
  const service = await createServiceClient();

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
    <AuthenticatedLayout>
      <main className="min-h-screen bg-[#090B0D] text-[#E6E8EB]">
        {/* Header */}
        <header className="border-b border-[#24282D] bg-[#0B0D0F] px-4 py-3">
          <div className="mx-auto flex max-w-7xl flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-[#77808C]">
                Marketplace
              </div>
              <h1 className="mt-0.5 text-[18px] font-semibold tracking-normal text-[#E6E8EB]">
                Fixed-price exchange
                <span className="ml-2 text-[12px] font-normal text-[#77808C]">
                  · {rows.length} active
                </span>
              </h1>
            </div>
            <Link
              href="/marketplace/sell/new"
              className="border border-[#20B26B] bg-[#20B26B] px-3 py-1.5 text-[12px] font-semibold text-[#07100B] transition-colors hover:bg-[#33C47C]"
            >
              List a card
            </Link>
          </div>
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
                              <div className="text-[9px] uppercase tracking-wide text-amber-300">
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
                              className={`inline-flex border px-1.5 py-0.5 text-[9px] uppercase tracking-wide ${PIPELINE_CHIP[r.pipeline]}`}
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
                              className="inline-flex border border-[#343941] bg-[#0B0D0F] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#B8C0CC] hover:border-[#5A626E] hover:text-[#E6E8EB]"
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
    </AuthenticatedLayout>
  );
}

function Th({
  children,
  align = "left",
  className = "",
  title,
}: {
  children: React.ReactNode;
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
      className={`sticky top-0 z-10 border-b border-[#24282D] bg-[#0B0D0F] px-2 py-2 text-[10px] font-medium uppercase tracking-[0.08em] text-[#77808C] ${alignClass} ${className}`}
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
  children: React.ReactNode;
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
