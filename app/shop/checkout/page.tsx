"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useShopCart } from "@/contexts/ShopCartContext";

export default function ShopCheckoutPage() {
  const router = useRouter();
  const { items, isHydrated, clearCart } = useShopCart();
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isHydrated) return;
    if (items.length === 0) {
      router.replace("/shop");
      return;
    }

    let cancelled = false;

    async function doCheckout() {
      setStatus("loading");
      setError(null);

      try {
        const res = await fetch("/api/shop/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: items.map((i) => ({
              listingId: i.listingId,
              quantity: i.quantity,
            })),
          }),
        });

        const data = await res.json();

        if (cancelled) return;

        if (!res.ok) {
          setStatus("error");
          setError(data.error ?? "Checkout failed");
          return;
        }

        if (data.url) {
          clearCart();
          window.location.href = data.url;
        } else {
          setStatus("error");
          setError("No checkout URL returned");
        }
      } catch {
        if (!cancelled) {
          setStatus("error");
          setError("Checkout failed. Please try again.");
        }
      }
    }

    doCheckout();
    return () => {
      cancelled = true;
    };
  }, [items, isHydrated, clearCart, router]);

  if (!isHydrated || (items.length === 0 && status === "idle")) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-b-2 border-cyan-500" />
        <p className="mt-4 text-slate-600">Redirecting...</p>
      </div>
    );
  }

  if (status === "loading") {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-b-2 border-cyan-500" />
        <p className="mt-4 text-slate-600">Redirecting to checkout...</p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="text-xl font-bold text-slate-900">Checkout failed</h1>
        <p className="mt-2 text-rose-600">{error}</p>
        <div className="mt-6 flex justify-center gap-4">
          <Link
            href="/shop"
            className="rounded-lg bg-cyan-600 px-6 py-3 font-medium text-white hover:bg-cyan-500"
          >
            Back to marketplace
          </Link>
          <button
            onClick={() => setStatus("idle")}
            className="rounded-lg border border-slate-300 px-6 py-3 font-medium text-slate-700 hover:border-slate-400 hover:text-slate-900"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-center">
      <div className="mx-auto h-8 w-8 animate-spin rounded-full border-b-2 border-cyan-500" />
      <p className="mt-4 text-slate-600">Redirecting...</p>
    </div>
  );
}
