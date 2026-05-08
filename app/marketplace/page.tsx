import Link from "next/link";
import AuthenticatedLayout from "@/components/AuthenticatedLayout";
import { createServiceClient } from "@/lib/supabase/server";
import MarketplaceListingCard, {
  type MarketplaceListingCardProps,
} from "@/components/marketplace/MarketplaceListingCard";

export const dynamic = "force-dynamic";

type Filters = {
  player?: string;
  manufacturer?: string;
  grade?: string;
  pipeline?: string;
  min_price?: string;
  max_price?: string;
};

type ListingRow = Omit<MarketplaceListingCardProps, "title" | "year" | "player" | "grade" | "grading_service"> & {
  marketplace_cards: {
    title: string;
    year: number;
    player: string;
    grade: string;
    grading_service: string;
    manufacturer: string;
  };
};

const PIPELINES = ["standard", "elite", "grails"] as const;

const FIELD_CLASS =
  "w-full bg-black border border-gray-800 rounded-md px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-white focus:ring-1 focus:ring-white/30 transition-colors";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-medium uppercase tracking-wider text-gray-500">
        {label}
      </span>
      {children}
    </label>
  );
}

function FilterBar({ filters }: { filters: Filters }) {
  return (
    <form
      method="get"
      className="rounded-lg border border-gray-900 bg-[#0a0a0a] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]"
    >
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Field label="Player">
          <input
            name="player"
            defaultValue={filters.player ?? ""}
            placeholder="Search player"
            className={FIELD_CLASS}
          />
        </Field>
        <Field label="Manufacturer">
          <select
            name="manufacturer"
            defaultValue={filters.manufacturer ?? "all"}
            className={FIELD_CLASS}
          >
            <option value="all">All</option>
            <option value="topps">Topps</option>
            <option value="panini">Panini</option>
          </select>
        </Field>
        <Field label="Grade">
          <input
            name="grade"
            defaultValue={filters.grade ?? ""}
            placeholder="Any"
            className={FIELD_CLASS}
          />
        </Field>
        <Field label="Tier">
          <select
            name="pipeline"
            defaultValue={filters.pipeline ?? ""}
            className={FIELD_CLASS}
          >
            <option value="">All tiers</option>
            <option value="standard">Standard</option>
            <option value="elite">Elite</option>
            <option value="grails">Grails</option>
          </select>
        </Field>
        <Field label="Min price">
          <input
            name="min_price"
            type="number"
            defaultValue={filters.min_price ?? ""}
            placeholder="$0"
            className={FIELD_CLASS}
          />
        </Field>
        <Field label="Max price">
          <input
            name="max_price"
            type="number"
            defaultValue={filters.max_price ?? ""}
            placeholder="$∞"
            className={FIELD_CLASS}
          />
        </Field>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <a
          href="?"
          className="text-xs px-4 py-2 rounded-md border border-gray-800 !text-gray-400 hover:border-gray-600 hover:!text-gray-200 transition-colors"
        >
          Reset
        </a>
        <button
          type="submit"
          className="text-xs px-4 py-2 rounded-md bg-white text-black font-semibold hover:bg-gray-200 transition-colors"
        >
          Apply filters
        </button>
      </div>
    </form>
  );
}

function EmptyState() {
  return (
    <div className="relative overflow-hidden rounded-xl border border-gray-900 bg-[#0a0a0a] p-12 text-center">
      <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] via-transparent to-transparent pointer-events-none" />
      <div className="relative space-y-4">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-gray-800 bg-black">
          <svg className="h-5 w-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
          </svg>
        </div>
        <div className="space-y-1.5">
          <h2 className="text-lg font-semibold text-white">No listings yet</h2>
          <p className="mx-auto max-w-md text-sm text-gray-500">
            The marketplace is open. Be the first to list a card and set the bar for verified, fixed-price slabs and singles.
          </p>
        </div>
        <div className="pt-2">
          <Link
            href="/marketplace/sell/new"
            className="inline-flex items-center gap-2 rounded-md bg-white px-5 py-2.5 text-sm font-semibold !text-black hover:bg-gray-200 hover:!text-black transition-colors"
          >
            List a card
            <span aria-hidden>→</span>
          </Link>
        </div>
      </div>
    </div>
  );
}

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
      "id, list_price_cents, pipeline, status, listed_at, marketplace_cards!inner(title, year, player, grade, grading_service, manufacturer)"
    )
    .in("status", ["active", "price_reduced"])
    .order("listed_at", { ascending: false })
    .limit(60);

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
      <main className="bg-black min-h-screen text-white">
        <div className="max-w-6xl mx-auto px-6 lg:px-10 py-6 lg:py-10 space-y-6">
          <div className="overflow-hidden rounded-md border border-gray-900 bg-black">
            <img
              src="/cardzcheck-marketplace-banner.png"
              alt="CardzCheck Marketplace"
              className="w-full h-16 sm:h-20 object-cover"
            />
          </div>

          <div className="flex items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Marketplace</h1>
              <p className="text-sm text-gray-500 mt-1">
                Fixed-price exchange · {rows.length} active listing
                {rows.length === 1 ? "" : "s"}
              </p>
            </div>
            <Link
              href="/marketplace/sell/new"
              className="hidden sm:inline-flex items-center gap-1.5 text-sm px-4 py-2 rounded-md border border-gray-800 !text-gray-300 hover:border-white hover:!text-white transition-colors"
            >
              List a card
              <span aria-hidden>→</span>
            </Link>
          </div>

          <FilterBar filters={filters} />

          {error && (
            <div className="rounded-md border border-red-900/60 bg-red-950/30 p-3 text-sm text-red-300">
              {error.message}
            </div>
          )}

          {rows.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {rows.map((r) => (
                <MarketplaceListingCard
                  key={r.id}
                  id={r.id}
                  list_price_cents={r.list_price_cents}
                  pipeline={r.pipeline}
                  status={r.status}
                  title={r.marketplace_cards.title}
                  year={r.marketplace_cards.year}
                  player={r.marketplace_cards.player}
                  grade={r.marketplace_cards.grade}
                  grading_service={r.marketplace_cards.grading_service}
                />
              ))}
            </div>
          )}
        </div>
      </main>
    </AuthenticatedLayout>
  );
}
