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

  type SessionInfo = {
    id: string;
    amount_total: number | null;
    customer_details: { email?: string; name?: string } | null;
  };

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
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-slate-900">Order not found</h1>
        <p className="mt-2 text-slate-600">
          We could not find your order. If you completed payment, you should
          receive a receipt by email.
        </p>
        <Link
          href="/shop"
          className="mt-6 inline-block rounded-lg bg-cyan-600 px-6 py-3 font-medium text-white hover:bg-cyan-500"
        >
          Back to shop
        </Link>
      </div>
    );
  }

  const total = (session.amount_total ?? 0) / 100;
  const email = session.customer_details?.email ?? "your email";
  const name = session.customer_details?.name ?? "";

  return (
    <div className="mx-auto max-w-lg px-4 py-16">
      <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">Thank you for your order</h1>
        <p className="mt-2 text-slate-600">A confirmation has been sent to {email}.</p>
        {name && <p className="mt-1 text-slate-600">Order for {name}</p>}
        <div className="mt-6 border-t border-slate-200 pt-6">
          <p className="text-slate-600">Total paid</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">${total.toFixed(2)}</p>
        </div>
        <p className="mt-6 text-sm text-slate-500">
          We will ship your order as soon as possible. You will receive tracking
          information via email when it ships.
        </p>
        <Link
          href="/shop"
          className="mt-8 block w-full rounded-lg bg-cyan-600 px-4 py-3 text-center font-medium text-white transition-colors hover:bg-cyan-500"
        >
          Continue shopping
        </Link>
      </div>
    </div>
  );
}
