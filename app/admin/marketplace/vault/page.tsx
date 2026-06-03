import { redirect } from "next/navigation";
import Link from "next/link";
import { getAdminAuth } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type VaultRow = {
  id: string;
  listing_id: string;
  intake_status: string;
  received_at: string | null;
  returned_at: string | null;
  return_reason: string | null;
  listings: {
    id: string;
    status: string;
    list_price_cents: number;
    marketplace_cards: { title: string; year: number; grade: string };
  } | null;
};

export default async function VaultPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const admin = await getAdminAuth();
  if (!admin.user) redirect("/");

  const { status } = await searchParams;
  const filter = ["pending", "approved", "rejected"].includes(status ?? "")
    ? status!
    : "pending";

  const service = await createServiceClient();
  const { data } = await service
    .from("vault_inventory")
    .select(
      "id, listing_id, intake_status, received_at, returned_at, return_reason, listings!inner(id, status, list_price_cents, marketplace_cards!inner(title, year, grade))"
    )
    .eq("intake_status", filter)
    .order("created_at", { ascending: false })
    .limit(100);

  const rows = ((data ?? []) as unknown as VaultRow[]) ?? [];

  return (
    <>
      <main className="p-6 lg:p-10 text-white">
        <div className="max-w-5xl mx-auto space-y-6">
          <div>
            <Link href="/admin/marketplace" className="text-sm text-gray-400 hover:text-white">
              ← Marketplace
            </Link>
            <h1 className="text-2xl font-bold mt-2">Vault inventory</h1>
            <div className="flex gap-2 mt-3 text-xs">
              {(["pending", "approved", "rejected"] as const).map((s) => (
                <Link
                  key={s}
                  href={`?status=${s}`}
                  className={`px-3 py-1 rounded border ${
                    filter === s
                      ? "border-cyan-500 text-cyan-400"
                      : "border-gray-800 text-gray-400 hover:border-gray-600"
                  }`}
                >
                  {s}
                </Link>
              ))}
            </div>
          </div>

          {rows.length === 0 ? (
            <p className="text-sm text-gray-400">No vault rows for this status.</p>
          ) : (
            <table className="w-full text-sm border border-gray-800 rounded-lg overflow-hidden">
              <thead className="bg-gray-900 text-gray-400 text-xs uppercase">
                <tr>
                  <th className="text-left p-3">Card</th>
                  <th className="text-left p-3">Listing</th>
                  <th className="text-right p-3">Price</th>
                  <th className="text-left p-3">Received</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-gray-800">
                    <td className="p-3">
                      <div className="font-medium">
                        {r.listings?.marketplace_cards.title ?? "—"}
                      </div>
                      <div className="text-xs text-gray-500">
                        {r.listings?.marketplace_cards.year} · {r.listings?.marketplace_cards.grade}
                      </div>
                    </td>
                    <td className="p-3 text-xs text-gray-400">
                      {r.listings?.status ?? "—"}
                    </td>
                    <td className="p-3 text-right">
                      {r.listings
                        ? `$${(r.listings.list_price_cents / 100).toLocaleString()}`
                        : "—"}
                    </td>
                    <td className="p-3 text-xs text-gray-400">
                      {r.received_at
                        ? new Date(r.received_at).toLocaleDateString()
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </>
  );
}
