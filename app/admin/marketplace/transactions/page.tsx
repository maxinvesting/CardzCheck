import { redirect } from "next/navigation";
import Link from "next/link";
import AuthenticatedLayout from "@/components/AuthenticatedLayout";
import { getAdminAuth } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type TransactionRow = {
  id: string;
  listing_id: string;
  sale_price_cents: number;
  fee_amount_cents: number;
  fee_tier: string;
  fulfilled_by: string;
  completed_at: string;
  listings: {
    marketplace_cards: { title: string; year: number; grade: string };
  } | null;
};

const FEE_TIER_LABELS: Record<string, string> = {
  one_pct: "1%",
  two_pct: "2%",
  five_pct: "5%",
  negotiated: "negotiated",
};

export default async function TransactionsPage() {
  const admin = await getAdminAuth();
  if (!admin.user) redirect("/");

  const service = await createServiceClient();
  const { data } = await service
    .from("transactions")
    .select(
      "id, listing_id, sale_price_cents, fee_amount_cents, fee_tier, fulfilled_by, completed_at, listings!inner(marketplace_cards!inner(title, year, grade))"
    )
    .order("completed_at", { ascending: false })
    .limit(100);

  const rows = ((data ?? []) as unknown as TransactionRow[]) ?? [];
  const totalGmv = rows.reduce((sum, r) => sum + r.sale_price_cents, 0);
  const totalFees = rows.reduce((sum, r) => sum + r.fee_amount_cents, 0);

  return (
    <AuthenticatedLayout>
      <main className="p-6 lg:p-10 text-white">
        <div className="max-w-5xl mx-auto space-y-6">
          <div>
            <Link href="/admin/marketplace" className="text-sm text-gray-400 hover:text-white">
              ← Marketplace
            </Link>
            <h1 className="text-2xl font-bold mt-2">Transactions</h1>
            <p className="text-sm text-gray-400 mt-1">
              Last 100 completed sales. GMV: ${(totalGmv / 100).toLocaleString()} · Fees: $
              {(totalFees / 100).toLocaleString()}
            </p>
          </div>

          {rows.length === 0 ? (
            <p className="text-sm text-gray-400">No transactions yet.</p>
          ) : (
            <table className="w-full text-sm border border-gray-800 rounded-lg overflow-hidden">
              <thead className="bg-gray-900 text-gray-400 text-xs uppercase">
                <tr>
                  <th className="text-left p-3">Date</th>
                  <th className="text-left p-3">Card</th>
                  <th className="text-right p-3">Sale</th>
                  <th className="text-right p-3">Fee</th>
                  <th className="text-left p-3">Tier</th>
                  <th className="text-left p-3">Fulfilled</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-gray-800">
                    <td className="p-3 text-xs text-gray-400">
                      {new Date(r.completed_at).toLocaleDateString()}
                    </td>
                    <td className="p-3">
                      <div className="font-medium">
                        {r.listings?.marketplace_cards.title ?? "—"}
                      </div>
                      <div className="text-xs text-gray-500">
                        {r.listings?.marketplace_cards.year} · {r.listings?.marketplace_cards.grade}
                      </div>
                    </td>
                    <td className="p-3 text-right">
                      ${(r.sale_price_cents / 100).toLocaleString()}
                    </td>
                    <td className="p-3 text-right">
                      ${(r.fee_amount_cents / 100).toLocaleString()}
                    </td>
                    <td className="p-3 text-xs text-gray-400">
                      {FEE_TIER_LABELS[r.fee_tier] ?? r.fee_tier}
                    </td>
                    <td className="p-3 text-xs text-gray-400">{r.fulfilled_by}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </AuthenticatedLayout>
  );
}
