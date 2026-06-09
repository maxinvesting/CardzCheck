"use client";

import { useEffect, useState } from "react";

/**
 * Polls the seller's unread marketplace-conversation count for nav badges.
 * Pass `enabled = false` to skip fetching entirely (e.g. logged-out users or
 * non-business contexts) so we don't make needless calls.
 */
export function useSellerUnreadCount(enabled: boolean, pollMs = 60_000): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setCount(0);
      return;
    }

    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/business/messages/unread-count", {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) {
          setCount(typeof data.unread === "number" ? data.unread : 0);
        }
      } catch {
        // ignore — badge just won't update this tick
      }
    }

    load();
    const timer = setInterval(load, pollMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [enabled, pollMs]);

  return count;
}
