"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import BusinessPaywall from "@/components/business/BusinessPaywall";
import BusinessMigrationBanner from "@/components/business/BusinessMigrationBanner";
import BusinessConsultantPanel from "@/components/business/BusinessConsultantPanel";
import { createClient } from "@/lib/supabase/client";

const shellClassName = "relative min-h-screen overflow-hidden bg-white text-gray-900";
const contentClassName = "relative mx-auto max-w-[96rem] px-4 py-4 sm:px-5 lg:px-8";
const shellBackdropClassName = "pointer-events-none absolute inset-0 bg-gray-50";

function LoadingSkeleton() {
  return (
    <>
      <main className={shellClassName}>
        <div className={shellBackdropClassName} />
        <div className={contentClassName}>
          <div className="mx-auto max-w-4xl space-y-4 animate-pulse">
            <div className="mx-auto h-6 w-32 rounded-full bg-gray-200" />
            <div className="mx-auto h-14 w-96 max-w-full rounded-full bg-gray-200" />
            <div className="mx-auto h-6 w-[42rem] max-w-full rounded-full bg-gray-100" />
            <div className="h-80 rounded-2xl border border-gray-200 bg-gray-50" />
          </div>
        </div>
      </main>
    </>
  );
}

function ConsultantPageContent() {
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
        router.push("/login?redirect=/business/consultant");
        return;
      }

      await loadAccess();
    }
    init();
  }, [router, loadAccess]);

  if (loading) {
    return (
      <>
        <main className={shellClassName}>
          <div className={shellBackdropClassName} />
          <div className={contentClassName}>
            <div className="mx-auto max-w-4xl space-y-4 animate-pulse">
              <div className="mx-auto h-6 w-32 rounded-full bg-gray-200" />
              <div className="mx-auto h-14 w-96 max-w-full rounded-full bg-gray-200" />
              <div className="mx-auto h-6 w-[42rem] max-w-full rounded-full bg-gray-100" />
              <div className="h-80 rounded-2xl border border-gray-200 bg-gray-50" />
            </div>
          </div>
        </main>
      </>
    );
  }

  if (hasAccess === false) {
    return (
      <>
        <main className={shellClassName}>
          <div className={shellBackdropClassName} />
          <div className={contentClassName}>
            <div className="mx-auto max-w-4xl">
              <BusinessPaywall />
            </div>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <main className={shellClassName}>
        <div className={shellBackdropClassName} />
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
    </>
  );
}

export default function BusinessConsultantPage() {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <ConsultantPageContent />
    </Suspense>
  );
}
