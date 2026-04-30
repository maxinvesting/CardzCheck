"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import AuthenticatedLayout from "@/components/AuthenticatedLayout";
import BusinessPaywall from "@/components/business/BusinessPaywall";
import BusinessMessagesView from "@/components/business/messaging/BusinessMessagesView";
import { createClient } from "@/lib/supabase/client";
import type { MessageThread, MessagingStats } from "@/lib/messaging/types";

export default function BusinessSalesPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [stats, setStats] = useState<MessagingStats | null>(null);
  const [threads, setThreads] = useState<MessageThread[]>([]);
  const [ebayConnected, setEbayConnected] = useState<boolean | null>(null);
  const [msgError, setMsgError] = useState<string | null>(null);
  const [businessName, setBusinessName] = useState<string | null>(null);
  const [syncRetriedAfterEmpty, setSyncRetriedAfterEmpty] = useState(false);

  const loadData = useCallback(async () => {
    setMsgError(null);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login?redirect=/business/sales");
        return;
      }

      const { data: profile } = await supabase
        .from("users")
        .select("business_name")
        .eq("id", user.id)
        .maybeSingle();
      if (profile?.business_name) setBusinessName(profile.business_name);

      const accessRes = await fetch("/api/business/inventory", {
        cache: "no-store",
      });
      if (accessRes.status === 403) {
        setHasAccess(false);
        setLoading(false);
        return;
      }
      if (accessRes.status === 401) {
        router.push("/login?redirect=/business/sales");
        return;
      }
      setHasAccess(true);

      const msgRes = await fetch("/api/business/messages", {
        cache: "no-store",
      });
      if (msgRes.status === 401) {
        router.push("/login?redirect=/business/sales");
        return;
      }
      if (msgRes.ok) {
        const data = await msgRes.json();
        setStats(data.stats);
        setThreads(data.threads);
        setEbayConnected(data.ebayConnected ?? false);
        setSyncRetriedAfterEmpty(Boolean(data?.sync?.retriedAfterEmpty));
      } else {
        setMsgError(`Failed to load sales workspace (${msgRes.status})`);
      }
    } catch (err) {
      setMsgError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) {
    return (
      <AuthenticatedLayout>
        <main className="mx-auto max-w-7xl px-4 py-4">
          <div className="animate-pulse space-y-4">
            <div className="h-28 rounded-[28px] bg-[#E5E7EB]" />
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-24 rounded-2xl bg-[#E5E7EB]" />
              ))}
            </div>
            <div className="grid gap-4 xl:grid-cols-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-48 rounded-2xl bg-[#E5E7EB]" />
              ))}
            </div>
            <div className="h-[520px] rounded-[28px] bg-[#E5E7EB]" />
          </div>
        </main>
      </AuthenticatedLayout>
    );
  }

  if (hasAccess === false) {
    return (
      <AuthenticatedLayout>
        <main className="max-w-7xl mx-auto px-4 py-4">
          <BusinessPaywall />
        </main>
      </AuthenticatedLayout>
    );
  }

  if (!stats) {
    return (
      <AuthenticatedLayout>
        <main className="mx-auto max-w-7xl px-4 py-8">
          <div className="flex flex-col items-center justify-center rounded-[28px] border border-dashed border-[var(--biz-border)] bg-white py-20 text-center shadow-sm">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50">
              <svg className="h-8 w-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
            </div>
            <h2 className="mb-2 text-lg font-semibold text-[var(--biz-text)]">
              Unable to load sales workspace
            </h2>
            <p className="mb-6 max-w-sm text-sm text-[var(--biz-muted)]">
              {msgError ?? "Something went wrong. Try refreshing or reconnecting your eBay account."}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setLoading(true);
                  loadData();
                }}
                className="inline-flex items-center gap-2 rounded-lg bg-[var(--biz-primary)] px-5 py-2.5 text-sm font-semibold text-[var(--biz-primary-foreground)] transition-colors hover:bg-[var(--biz-primary-hover)]"
              >
                Try Again
              </button>
              <a
                href="/api/auth/ebay"
                className="inline-flex items-center gap-2 rounded-lg border border-[var(--biz-border)] bg-white px-5 py-2.5 text-sm font-semibold text-[var(--biz-text)] transition-colors hover:bg-gray-50"
              >
                Reconnect eBay
              </a>
            </div>
          </div>
        </main>
      </AuthenticatedLayout>
    );
  }

  if (stats.total_threads === 0 && threads.length === 0) {
    const isConnected = ebayConnected === true;
    return (
      <AuthenticatedLayout>
        <main className="mx-auto max-w-7xl px-4 py-8">
          <div className="flex flex-col items-center justify-center rounded-[28px] border border-dashed border-[var(--biz-border)] bg-white py-20 text-center shadow-sm">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--biz-primary-soft)]">
              <svg className="h-8 w-8 text-[var(--biz-primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V7a2 2 0 00-2-2h-3m-2 14H6a2 2 0 01-2-2V7a2 2 0 012-2h2m3 14l5-5m0 0l5-5m-5 5H9" />
              </svg>
            </div>
            {isConnected ? (
              <>
                <h2 className="mb-2 text-lg font-semibold text-[var(--biz-text)]">
                  eBay is connected, but there are no live buyer threads yet
                </h2>
                <p className="mb-6 max-w-md text-sm text-[var(--biz-muted)]">
                  The sales desk is ready. Offers, buyer questions, and follow-ups will show up here
                  as soon as they land. If you expected activity already, reconnect to refresh marketplace access.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <a
                    href="/api/auth/ebay"
                    className="inline-flex items-center gap-2 rounded-lg border border-[var(--biz-border)] bg-white px-5 py-2.5 text-sm font-semibold text-[var(--biz-text)] transition-colors hover:bg-gray-50"
                  >
                    Reconnect eBay
                  </a>
                  <a
                    href="/business/ledger?tab=sales"
                    className="inline-flex items-center gap-2 rounded-lg bg-[var(--biz-primary)] px-5 py-2.5 text-sm font-semibold text-[var(--biz-primary-foreground)] transition-colors hover:bg-[var(--biz-primary-hover)]"
                  >
                    Open ledger sales
                  </a>
                </div>
              </>
            ) : (
              <>
                <h2 className="mb-2 text-lg font-semibold text-[var(--biz-text)]">
                  Connect eBay to power the sales desk
                </h2>
                <p className="mb-6 max-w-md text-sm text-[var(--biz-muted)]">
                  Link your eBay account to pull in live offers, buyer questions, and follow-ups.
                </p>
                <a
                  href="/api/auth/ebay"
                  className="inline-flex items-center gap-2 rounded-lg bg-[var(--biz-primary)] px-5 py-2.5 text-sm font-semibold text-[var(--biz-primary-foreground)] transition-colors hover:bg-[var(--biz-primary-hover)]"
                >
                  Connect eBay Account
                </a>
              </>
            )}
            {syncRetriedAfterEmpty ? (
              <p className="mt-5 text-xs text-amber-700">
                We retried a background sync automatically while checking for live threads.
              </p>
            ) : null}
          </div>
        </main>
      </AuthenticatedLayout>
    );
  }

  return (
    <AuthenticatedLayout>
      <main className="sales-mono-theme flex h-screen flex-col overflow-hidden">
        <BusinessMessagesView
          initialStats={stats}
          initialThreads={threads}
          businessName={businessName}
          initialSyncRetriedAfterEmpty={syncRetriedAfterEmpty}
        />
      </main>
    </AuthenticatedLayout>
  );
}
