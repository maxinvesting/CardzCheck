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
      } catch (err) {
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
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500 mx-auto" />
        <p className="mt-4 text-gray-400">Redirecting...</p>
      </div>
    );
  }

  if (status === "loading") {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500 mx-auto" />
        <p className="mt-4 text-gray-400">Redirecting to checkout...</p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <h1 className="text-xl font-bold text-white">Checkout Failed</h1>
        <p className="mt-2 text-red-400">{error}</p>
        <div className="mt-6 flex gap-4 justify-center">
          <Link
            href="/shop"
            className="px-6 py-3 bg-cyan-600 hover:bg-cyan-700 text-white font-medium rounded-lg"
          >
            Back to Shop
          </Link>
          <button
            onClick={() => setStatus("idle")}
            className="px-6 py-3 border border-gray-600 text-gray-300 hover:text-white font-medium rounded-lg"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-16 text-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500 mx-auto" />
      <p className="mt-4 text-gray-400">Redirecting...</p>
    </div>
  );
}
