"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import BusinessPaywall from "@/components/business/BusinessPaywall";
import BusinessMigrationBanner from "@/components/business/BusinessMigrationBanner";
import BusinessConsultantPanel from "@/components/business/BusinessConsultantPanel";
import { createClient } from "@/lib/supabase/client";

// Business Advisor — lives in the Assistants suite. Transparent shell; inherits
// the "Merchant Desk" dark canvas painted by AuthenticatedLayout.
const shellClassName = "relative min-h-screen text-[var(--biz-text)]";
const contentClassName = "relative mx-auto max-w-[96rem] px-4 py-4 sm:px-5 lg:px-8";

const LOGIN_REDIRECT = "/login?redirect=/assistants/advisor";

function LoadingSkeleton() {
  return (
    <main className={shellClassName}>
      <div className={contentClassName}>
        <div className="mx-auto max-w-4xl space-y-4 animate-pulse">
          <div className="mx-auto h-6 w-32 rounded-full bg-[var(--biz-skeleton)]" />
          <div className="mx-auto h-14 w-96 max-w-full rounded-full bg-[var(--biz-skeleton)]" />
          <div className="mx-auto h-6 w-[42rem] max-w-full rounded-full bg-[var(--biz-surface-soft)]" />
          <div className="h-80 rounded-2xl border border-[var(--biz-border)] bg-[var(--biz-surface)]" />
        </div>
      </div>
    </main>
  );
}

function AdvisorPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialPrompt = searchParams.get("prompt") ?? undefined;

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
        router.push(LOGIN_REDIRECT);
        return;
      }

      await loadAccess();
    }
    init();
  }, [router, loadAccess]);

  if (loading) {
    return <LoadingSkeleton />;
  }

  if (hasAccess === false) {
    return (
      <main className={shellClassName}>
        <div className={contentClassName}>
          <div className="mx-auto max-w-4xl">
            <BusinessPaywall />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className={shellClassName}>
      <div className={contentClassName}>
        {needsMigration ? (
          <div className="mx-auto max-w-4xl">
            <BusinessMigrationBanner
              onRetry={() => {
                setLoading(true);
                void loadAccess();
              }}
            />
          </div>
        ) : (
          <BusinessConsultantPanel initialPrompt={initialPrompt} />
        )}
      </div>
    </main>
  );
}

export default function BusinessAdvisorPage() {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <AdvisorPageContent />
    </Suspense>
  );
}
