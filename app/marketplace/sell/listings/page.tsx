import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type SellerListingRow = {
  id: string;
  status: "active" | "price_reduced" | "flagged" | "removed" | "sold";
  mode: "self_serve" | "full_service";
  list_price_cents: number;
  cmv_mid_cents: number | null;
  fee_tier: string;
  pipeline: string;
  listed_at: string;
  marketplace_cards: {
    title: string;
    year: number;
    grade: string;
    grading_service: string;
  };
  vault_inventory: { intake_status: string }[] | null;
};

const STATUS_CLASSES: Record<string, string> = {
  active: "bg-emerald-900/40 text-emerald-300 border-emerald-700",
  price_reduced: "bg-amber-900/40 text-amber-300 border-amber-700",
  flagged: "bg-red-900/40 text-red-300 border-red-700",
  removed: "bg-gray-800 text-gray-400 border-gray-700",
  sold: "bg-cyan-900/40 text-cyan-300 border-cyan-700",
};

const FEE_TIER_LABELS: Record<string, string> = {
  one_pct: "1%",
  two_pct: "2%",
  five_pct: "5%",
  negotiated: "negotiated",
};

export default async function SellerListingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/marketplace/sell/listings");

  const service = await createServiceClient();
  const { data } = await service
    .from("listings")
    .select(
      "id, status, mode, list_price_cents, cmv_mid_cents, fee_tier, pipeline, listed_at, marketplace_cards!inner(title, year, grade, grading_service), vault_inventory(intake_status)"
    )
    .eq("seller_id", user.id)
    .order("listed_at", { ascending: false });

  const rows = ((data ?? []) as unknown as SellerListingRow[]) ?? [];

  return (
    <>
      <main className="p-6 lg:p-10 text-white">
        <div className="max-w-5xl mx-auto space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">My listings</h1>
              <p className="text-sm text-gray-400 mt-1">
                {rows.length} listing{rows.length === 1 ? "" : "s"}
              </p>
            </div>
            <div className="flex gap-2">
              <Link
                href="/marketplace/sell/orders"
                className="px-3 py-2 rounded border border-gray-700 hover:border-gray-500 text-sm"
              >
                Sales &amp; fulfillment
              </Link>
              <Link
                href="/marketplace/sell/new"
                className="px-3 py-2 rounded bg-cyan-700 hover:bg-cyan-600 text-sm"
              >
                + New listing
              </Link>
            </div>
          </div>

          {rows.length === 0 ? (
            <div className="rounded border border-dashed border-gray-700 p-8 text-center text-gray-400 text-sm">
              You haven't listed anything yet.{" "}
              <Link href="/marketplace/sell/new" className="text-cyan-400 hover:underline">
                List your first card
              </Link>
              .
            </div>
          ) : (
            <table className="w-full text-sm border border-gray-800 rounded-lg overflow-hidden">
              <thead className="bg-gray-900 text-gray-400 text-xs uppercase">
                <tr>
                  <th className="text-left p-3">Card</th>
                  <th className="text-left p-3">Mode</th>
                  <th className="text-left p-3">Pipeline</th>
                  <th className="text-right p-3">Price</th>
                  <th className="text-left p-3">Fee</th>
                  <th className="text-left p-3">Status</th>
                  <th className="text-left p-3">Vault</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const vaultStatus = r.vault_inventory?.[0]?.intake_status;
                  return (
                    <tr key={r.id} className="border-t border-gray-800">
                      <td className="p-3">
                        <div className="font-medium">{r.marketplace_cards.title}</div>
                        <div className="text-xs text-gray-500">
                          {r.marketplace_cards.year} · {r.marketplace_cards.grading_service}{" "}
                          {r.marketplace_cards.grade}
                        </div>
                      </td>
                      <td className="p-3 text-xs text-gray-400">
                        {r.mode === "self_serve" ? "Self-serve" : "Full-service"}
                      </td>
                      <td className="p-3 text-xs text-gray-400 capitalize">
                        {r.pipeline}
                      </td>
                      <td className="p-3 text-right">
                        ${(r.list_price_cents / 100).toLocaleString()}
                        {r.mode === "full_service" && (
                          <div className="text-xs text-gray-500">
                            (CMV mid)
                          </div>
                        )}
                      </td>
                      <td className="p-3 text-xs text-gray-400">
                        {FEE_TIER_LABELS[r.fee_tier] ?? r.fee_tier}
                      </td>
                      <td className="p-3">
                        <span
                          className={`text-xs px-2 py-0.5 rounded border ${
                            STATUS_CLASSES[r.status] ?? "border-gray-700"
                          }`}
                        >
                          {r.status.replace("_", " ")}
                        </span>
                      </td>
                      <td className="p-3 text-xs text-gray-400">
                        {r.mode === "full_service" ? vaultStatus ?? "—" : "n/a"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </>
  );
}
