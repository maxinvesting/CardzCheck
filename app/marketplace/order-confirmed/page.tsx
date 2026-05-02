import Link from "next/link";
import AuthenticatedLayout from "@/components/AuthenticatedLayout";

export const dynamic = "force-dynamic";

export default async function OrderConfirmedPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id } = await searchParams;

  return (
    <AuthenticatedLayout>
      <main className="p-6 lg:p-10 text-white">
        <div className="max-w-xl mx-auto space-y-6 text-center">
          <div className="text-4xl">✓</div>
          <h1 className="text-2xl font-bold">Order received</h1>
          <p className="text-sm text-gray-400">
            Your payment is being processed. You'll get a confirmation email
            once Stripe finalizes the transaction. Fulfillment details will
            follow from the seller or platform.
          </p>
          {session_id && (
            <p className="text-xs text-gray-500 break-all">
              Session: {session_id}
            </p>
          )}
          <div className="flex gap-2 justify-center pt-2">
            <Link
              href="/marketplace"
              className="px-4 py-2 rounded bg-cyan-700 hover:bg-cyan-600 text-sm"
            >
              Browse more
            </Link>
            <Link
              href="/marketplace/sell/listings"
              className="px-4 py-2 rounded border border-gray-700 hover:border-gray-500 text-sm"
            >
              My listings
            </Link>
          </div>
        </div>
      </main>
    </AuthenticatedLayout>
  );
}
