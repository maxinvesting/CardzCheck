"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AuthenticatedLayout from "@/components/AuthenticatedLayout";
import BusinessPaywall from "@/components/business/BusinessPaywall";
import BusinessMigrationBanner from "@/components/business/BusinessMigrationBanner";
import BusinessConsultantPanel from "@/components/business/BusinessConsultantPanel";
import { createClient } from "@/lib/supabase/client";

const shellClassName =
  "relative min-h-screen overflow-hidden bg-[#080b11] text-slate-100";
const contentClassName = "relative mx-auto max-w-[96rem] px-4 py-4 sm:px-5 lg:px-8";

function LoadingSkeleton() {
  return (
    <AuthenticatedLayout>
      <main className={shellClassName}>
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(52,211,153,0.16),transparent_34%),radial-gradient(circle_at_82%_16%,rgba(96,165,250,0.12),transparent_28%),linear-gradient(180deg,#080b11_0%,#0b0f16_42%,#080b11_100%)]" />
        <div className={contentClassName}>
          <div className="mx-auto max-w-4xl space-y-4 animate-pulse">
            <div className="mx-auto h-6 w-32 rounded-full bg-white/10" />
            <div className="mx-auto h-14 w-96 max-w-full rounded-full bg-white/10" />
            <div className="mx-auto h-6 w-[42rem] max-w-full rounded-full bg-white/5" />
            <div className="h-80 rounded-[32px] border border-white/10 bg-white/[0.04]" />
          </div>
        </div>
      </main>
    </AuthenticatedLayout>
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
      <AuthenticatedLayout>
        <main className={shellClassName}>
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(52,211,153,0.16),transparent_34%),radial-gradient(circle_at_82%_16%,rgba(96,165,250,0.12),transparent_28%),linear-gradient(180deg,#080b11_0%,#0b0f16_42%,#080b11_100%)]" />
          <div className={contentClassName}>
            <div className="mx-auto max-w-4xl space-y-4 animate-pulse">
              <div className="mx-auto h-6 w-32 rounded-full bg-white/10" />
              <div className="mx-auto h-14 w-96 max-w-full rounded-full bg-white/10" />
              <div className="mx-auto h-6 w-[42rem] max-w-full rounded-full bg-white/5" />
              <div className="h-80 rounded-[32px] border border-white/10 bg-white/[0.04]" />
            </div>
          </div>
        </main>
      </AuthenticatedLayout>
    );
  }

  if (hasAccess === false) {
    return (
      <AuthenticatedLayout>
        <main className={shellClassName}>
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(52,211,153,0.16),transparent_34%),radial-gradient(circle_at_82%_16%,rgba(96,165,250,0.12),transparent_28%),linear-gradient(180deg,#080b11_0%,#0b0f16_42%,#080b11_100%)]" />
          <div className={contentClassName}>
            <div className="mx-auto max-w-4xl">
              <BusinessPaywall />
            </div>
          </div>
        </main>
      </AuthenticatedLayout>
    );
  }

  return (
    <AuthenticatedLayout>
      <main className={shellClassName}>
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(52,211,153,0.16),transparent_34%),radial-gradient(circle_at_82%_16%,rgba(96,165,250,0.12),transparent_28%),linear-gradient(180deg,#080b11_0%,#0b0f16_42%,#080b11_100%)]" />
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
    </AuthenticatedLayout>
  );
}

export default function BusinessConsultantPage() {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <ConsultantPageContent />
    </Suspense>
  );
}
