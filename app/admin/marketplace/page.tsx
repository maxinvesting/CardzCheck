import { redirect } from "next/navigation";
import Link from "next/link";
import { getAdminAuth } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function loadCounts() {
  const service = await createServiceClient();
  const [pendingIntake, flagged, pendingVault, recentTransactions] =
    await Promise.all([
      service
        .from("marketplace_cards")
        .select("id", { count: "exact", head: true })
        .eq("intake_approved", false),
      service
        .from("listings")
        .select("id", { count: "exact", head: true })
        .eq("status", "flagged"),
      service
        .from("vault_inventory")
        .select("id", { count: "exact", head: true })
        .eq("intake_status", "pending"),
      service
        .from("transactions")
        .select("id", { count: "exact", head: true })
        .gte(
          "completed_at",
          new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
        ),
    ]);
  return {
    pendingIntake: pendingIntake.count ?? 0,
    flagged: flagged.count ?? 0,
    pendingVault: pendingVault.count ?? 0,
    recentTransactions: recentTransactions.count ?? 0,
  };
}

export default async function MarketplaceAdminOverview() {
  const admin = await getAdminAuth();
  if (!admin.user) redirect("/");

  const counts = await loadCounts();

  const tiles = [
    {
      href: "/admin/marketplace/intake",
      label: "Intake queue",
      value: counts.pendingIntake,
      hint: "Cards awaiting manual approval (elite tier).",
    },
    {
      href: "/admin/marketplace/flagged",
      label: "Flagged listings",
      value: counts.flagged,
      hint: "Day-60 listings awaiting decision.",
    },
    {
      href: "/admin/marketplace/vault",
      label: "Pending vault",
      value: counts.pendingVault,
      hint: "Vault items still pending intake.",
    },
    {
      href: "/admin/marketplace/transactions",
      label: "Sales (7d)",
      value: counts.recentTransactions,
      hint: "Transactions completed in the last week.",
    },
  ];

  return (
    <>
      <main className="p-6 lg:p-10 text-white">
        <div className="max-w-5xl mx-auto space-y-8">
          <div>
            <Link href="/admin" className="text-sm text-gray-400 hover:text-white">
              ← Admin
            </Link>
            <h1 className="text-2xl font-bold mt-2">Marketplace</h1>
            <p className="text-sm text-gray-400 mt-1">
              Intake, lifecycle, vault, and transactions.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {tiles.map((t) => (
              <Link
                key={t.href}
                href={t.href}
                className="rounded-xl border border-gray-800 bg-gray-900 p-5 hover:border-cyan-500 transition-colors"
              >
                <div className="text-xs uppercase tracking-wide text-gray-400">
                  {t.label}
                </div>
                <div className="text-3xl font-semibold mt-2">{t.value}</div>
                <p className="text-xs text-gray-500 mt-2">{t.hint}</p>
              </Link>
            ))}
          </div>
        </div>
      </main>
    </>
  );
}
