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
      <main className="p-6 lg:p-10 text-white">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold">Marketplace</h1>
              <p className="text-sm text-gray-400 mt-1">
                Fixed-price exchange. {rows.length} active listing
                {rows.length === 1 ? "" : "s"}.
              </p>
            </div>
            <Link
              href="/marketplace/sell/new"
              className="text-sm px-3 py-2 rounded border border-gray-700 hover:border-cyan-500"
            >
              List a card →
            </Link>
          </div>

          <FilterBar filters={filters} />

          {error && (
            <div className="rounded border border-red-700 bg-red-950/40 p-3 text-sm text-red-300">
              {error.message}
            </div>
          )}

          {rows.length === 0 ? (
            <div className="rounded border border-dashed border-gray-700 p-12 text-center text-gray-400">
              No listings match your filters.
            </div>
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

function FilterBar({ filters }: { filters: Filters }) {
  return (
    <form
      method="get"
      className="grid grid-cols-2 md:grid-cols-6 gap-2 text-sm rounded border border-gray-800 bg-gray-900 p-3"
    >
      <input
        name="player"
        defaultValue={filters.player ?? ""}
        placeholder="Player"
        className="bg-gray-950 border border-gray-800 rounded px-2 py-1 text-sm"
      />
      <select
        name="manufacturer"
        defaultValue={filters.manufacturer ?? "all"}
        className="bg-gray-950 border border-gray-800 rounded px-2 py-1 text-sm"
      >
        <option value="all">All manufacturers</option>
        <option value="topps">Topps</option>
        <option value="panini">Panini</option>
      </select>
      <input
        name="grade"
        defaultValue={filters.grade ?? ""}
        placeholder="Grade"
        className="bg-gray-950 border border-gray-800 rounded px-2 py-1 text-sm"
      />
      <select
        name="pipeline"
        defaultValue={filters.pipeline ?? ""}
        className="bg-gray-950 border border-gray-800 rounded px-2 py-1 text-sm"
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
        className="bg-gray-950 border border-gray-800 rounded px-2 py-1 text-sm"
      />
      <input
        name="max_price"
        type="number"
        defaultValue={filters.max_price ?? ""}
        placeholder="Max $"
        className="bg-gray-950 border border-gray-800 rounded px-2 py-1 text-sm"
      />
      <div className="col-span-2 md:col-span-6 flex justify-end">
        <button
          type="submit"
          className="text-xs px-3 py-1 rounded bg-cyan-700 hover:bg-cyan-600"
        >
          Apply filters
        </button>
      </div>
    </form>
  );
}
