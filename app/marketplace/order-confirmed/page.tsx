import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/server";
import MessageSellerCTA from "./MessageSellerCTA";

export const dynamic = "force-dynamic";

export default async function OrderConfirmedPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id } = await searchParams;

  let transactionId: string | null = null;
  if (session_id) {
    const service = await createServiceClient();
    const { data: tx } = await service
      .from("transactions")
      .select("id")
      .eq("stripe_session_id", session_id)
      .maybeSingle();
    transactionId = (tx as { id?: string } | null)?.id ?? null;
  }

  return (
    <>
      <main className="p-6 lg:p-10 text-white">
        <div className="max-w-xl mx-auto space-y-6 text-center">
          <div className="text-4xl">✓</div>
          <h1 className="text-2xl font-bold">Order confirmed</h1>
          <p className="text-sm text-gray-400">
            Payment received and the seller has been notified. They&apos;ll ship to the
            address you entered at checkout and add tracking. You can follow the status
            anytime under <span className="text-gray-200">My purchases</span>.
          </p>
          {transactionId ? (
            <MessageSellerCTA transactionId={transactionId} />
          ) : null}
          <div className="flex flex-wrap gap-2 justify-center pt-2">
            <Link
              href="/marketplace/orders"
              className="px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-500 text-sm font-semibold text-[#07100B]"
            >
              View my purchases
            </Link>
            <Link
              href="/marketplace"
              className="px-4 py-2 rounded border border-gray-700 hover:border-gray-500 text-sm"
            >
              Browse more
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}
