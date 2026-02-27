"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import AuthenticatedLayout from "@/components/AuthenticatedLayout";
import BusinessPaywall from "@/components/business/BusinessPaywall";
import BusinessMigrationBanner from "@/components/business/BusinessMigrationBanner";
import BusinessConsultantPanel from "@/components/business/BusinessConsultantPanel";
import { createClient } from "@/lib/supabase/client";

export default function BusinessConsultantPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [needsMigration, setNeedsMigration] = useState(false);

  const loadAccess = useCallback(async () => {
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
        return;
      }
      setNeedsMigration(false);
      setHasAccess(true);
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
        router.push("/login?redirect=/business/consultant");
        return;
      }

      await loadAccess();
    }
    init();
  }, [router, loadAccess]);

  if (loading) {
    return (
      <AuthenticatedLayout>
        <main className="mx-auto max-w-4xl px-4 py-6">
          <div className="space-y-3 animate-pulse">
            <div className="h-8 w-64 rounded bg-gray-800" />
            <div className="h-48 rounded-xl bg-gray-800" />
          </div>
        </main>
      </AuthenticatedLayout>
    );
  }

  if (hasAccess === false) {
    return (
      <AuthenticatedLayout>
        <main className="mx-auto max-w-4xl px-4 py-6">
          <BusinessPaywall />
        </main>
      </AuthenticatedLayout>
    );
  }

  return (
    <AuthenticatedLayout>
      <main className="mx-auto max-w-4xl px-4 py-6">
        {needsMigration ? (
          <BusinessMigrationBanner
            onRetry={() => {
              setLoading(true);
              loadAccess();
            }}
          />
        ) : (
          <BusinessConsultantPanel />
        )}
      </main>
    </AuthenticatedLayout>
  );
}
