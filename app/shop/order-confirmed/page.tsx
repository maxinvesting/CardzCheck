import { redirect } from "next/navigation";
import { stripe } from "@/lib/stripe";
import Link from "next/link";

export default async function OrderConfirmedPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id } = await searchParams;

  if (!session_id) {
    redirect("/shop");
  }

  type SessionInfo = { id: string; amount_total: number | null; customer_details: { email?: string; name?: string } | null };
  let session: SessionInfo | null = null;

  try {
    const client = stripe();
    const retrieved = await client.checkout.sessions.retrieve(session_id, {
      expand: ["line_items"],
    });
    session = {
      id: retrieved.id,
      amount_total: retrieved.amount_total,
      customer_details: retrieved.customer_details
        ? {
            email: retrieved.customer_details.email ?? undefined,
            name: retrieved.customer_details.name ?? undefined,
          }
        : null,
    };
  } catch (err) {
    console.error("Failed to fetch checkout session:", err);
  }

  if (!session) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-white">Order Not Found</h1>
        <p className="mt-2 text-gray-400">
          We could not find your order. If you completed payment, you should
          receive a receipt by email.
        </p>
        <Link
          href="/shop"
          className="mt-6 inline-block px-6 py-3 bg-cyan-600 hover:bg-cyan-700 text-white font-medium rounded-lg"
        >
          Back to Shop
        </Link>
      </div>
    );
  }

  const total = (session.amount_total ?? 0) / 100;
  const email = session.customer_details?.email ?? "your email";
  const name = session.customer_details?.name ?? "";

  return (
    <div className="max-w-lg mx-auto px-4 py-16">
      <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-8">
        <h1 className="text-2xl font-bold text-white">Thank you for your order!</h1>
        <p className="mt-2 text-gray-400">
          A confirmation has been sent to {email}.
        </p>
        {name && (
          <p className="mt-1 text-gray-400">
            Order for {name}
          </p>
        )}
        <div className="mt-6 pt-6 border-t border-gray-800">
          <p className="text-gray-400">Total paid</p>
          <p className="text-2xl font-bold text-cyan-400 mt-1">
            ${total.toFixed(2)}
          </p>
        </div>
        <p className="mt-6 text-sm text-gray-500">
          We will ship your order as soon as possible. You will receive tracking
          information via email when it ships.
        </p>
        <Link
          href="/shop"
          className="mt-8 block w-full py-3 px-4 bg-cyan-600 hover:bg-cyan-700 text-white font-medium rounded-lg text-center transition-colors"
        >
          Continue Shopping
        </Link>
      </div>
    </div>
  );
}
