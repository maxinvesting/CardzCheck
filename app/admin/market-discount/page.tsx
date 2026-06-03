import { redirect } from "next/navigation";
import { getAdminAuth } from "@/lib/admin";
import MarketDiscountAdminClient from "@/app/admin/market-discount/MarketDiscountAdminClient";

export default async function MarketDiscountAdminPage() {
  const admin = await getAdminAuth();

  if (!admin.user) {
    redirect("/comps");
  }

  return (
    <>
      <main className="p-6 lg:p-10 text-white">
        <div className="max-w-6xl mx-auto space-y-6">
          <div>
            <h1 className="text-2xl font-bold">Market Discount Analyzer</h1>
            <p className="text-sm text-gray-400 mt-1">
              Internal view for active vs sold discount factors and CMV model behavior.
            </p>
          </div>
          <MarketDiscountAdminClient />
        </div>
      </main>
    </>
  );
}
