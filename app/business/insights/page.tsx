"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import BusinessAnalystPanel from "@/components/business/BusinessAnalystPanel";
import BusinessMigrationBanner from "@/components/business/BusinessMigrationBanner";
import BusinessPaywall from "@/components/business/BusinessPaywall";
import { createClient } from "@/lib/supabase/client";
import type { BusinessInventoryItem } from "@/types";

export default function BusinessInsightsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [needsMigration, setNeedsMigration] = useState(false);
  const [items, setItems] = useState<BusinessInventoryItem[]>([]);

  const loadInventory = useCallback(async () => {
    try {
      const res = await fetch("/api/business/inventory", { cache: "no-store" });
      if (res.status === 403) {
        setHasAccess(false);
        setLoading(false);
        return;
      }
      const data = await res.json();
      if (res.status === 503 && data.needs_migration) {
        setNeedsMigration(true);
        setHasAccess(true);
        setItems([]);
        return;
      }
      setNeedsMigration(false);
      setHasAccess(true);
      setItems(data.items ?? []);
    } catch {
      setHasAccess(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    async function init() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login?redirect=/business/insights");
        return;
      }

      await loadInventory();
    }
    init();
  }, [router, loadInventory]);

  if (loading) {
    return (
      <>
        <main className="mx-auto max-w-7xl px-4 py-4">
          <div className="space-y-3 animate-pulse">
            <div className="h-8 w-64 rounded bg-gray-800" />
            <div className="h-48 rounded-xl bg-gray-800" />
          </div>
        </main>
      </>
    );
  }

  if (hasAccess === false) {
    return (
      <>
        <main className="mx-auto max-w-4xl px-4 py-6">
          <BusinessPaywall />
        </main>
      </>
    );
  }

  return (
    <>
      <main className="mx-auto max-w-7xl px-4 py-4">
        {needsMigration ? (
          <BusinessMigrationBanner
            onRetry={() => {
              setLoading(true);
              loadInventory();
            }}
          />
        ) : (
          <BusinessAnalystPanel items={items} />
        )}
      </main>
    </>
  );
}
