"use client";

import { Suspense, useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import AuthenticatedLayout from "@/components/AuthenticatedLayout";
import BusinessPaywall from "@/components/business/BusinessPaywall";
import BusinessMessagesView from "@/components/business/messaging/BusinessMessagesView";
import { createClient } from "@/lib/supabase/client";
import type { MessageThread, MessagingStats } from "@/lib/messaging/types";

function BusinessMessagesContent() {
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
        router.push("/login?redirect=/business/messages");
        return;
      }

      // Fetch business name for UI personalisation
      const { data: profile } = await supabase
        .from("users")
        .select("business_name")
        .eq("id", user.id)
        .maybeSingle();
      if (profile?.business_name) setBusinessName(profile.business_name);

      // Check business access
      const accessRes = await fetch("/api/business/inventory", {
        cache: "no-store",
      });
      if (accessRes.status === 403) {
        setHasAccess(false);
        setLoading(false);
        return;
      }
      if (accessRes.status === 401) {
        router.push("/login?redirect=/business/messages");
        return;
      }
      setHasAccess(true);

      // Load messaging data
      const msgRes = await fetch("/api/business/messages", {
        cache: "no-store",
      });
      if (msgRes.status === 401) {
        // Session expired server-side — redirect to re-login
        router.push("/login?redirect=/business/messages");
        return;
      }
      if (msgRes.ok) {
        const data = await msgRes.json();
        setStats(data.stats);
        setThreads(data.threads);
        setEbayConnected(data.ebayConnected ?? false);
        setSyncRetriedAfterEmpty(Boolean(data?.sync?.retriedAfterEmpty));
      } else {
        setMsgError(`Failed to load messages (${msgRes.status})`);
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
        <main className="max-w-7xl mx-auto px-4 py-4">
          <div className="animate-pulse space-y-4">
            <div className="h-8 w-48 rounded bg-[#E5E7EB]" />
            <div className="grid grid-cols-5 gap-2">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-16 rounded-lg bg-[#E5E7EB]" />
              ))}
            </div>
            <div className="h-[500px] rounded-xl bg-[#E5E7EB]" />
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
          <h1 className="text-2xl font-bold text-[var(--biz-text)] mb-8">Customer Service</h1>
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--biz-border)] bg-white py-20 text-center shadow-sm">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50">
              <svg className="h-8 w-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
            </div>
            <h2 className="mb-2 text-lg font-semibold text-[var(--biz-text)]">Unable to load customer service inbox</h2>
            <p className="mb-6 max-w-sm text-sm text-[var(--biz-muted)]">
              {msgError ?? "Something went wrong. Try refreshing or reconnecting your eBay account."}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => { setLoading(true); loadData(); }}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-500"
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

  // No threads — show appropriate state based on whether eBay is connected
  if (stats.total_threads === 0 && threads.length === 0) {
    const isConnected = ebayConnected === true;
    return (
      <AuthenticatedLayout>
        <main className="mx-auto max-w-7xl px-4 py-8">
          <h1 className="text-2xl font-bold text-[var(--biz-text)] mb-8">Customer Service</h1>
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--biz-border)] bg-white py-20 text-center shadow-sm">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#F0FDF4]">
              <svg className="h-8 w-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
            </div>
            {isConnected ? (
              <>
                <h2 className="mb-2 text-lg font-semibold text-[var(--biz-text)]">eBay connected — no messages yet</h2>
                <p className="mb-6 max-w-sm text-sm text-[var(--biz-muted)]">
                  Your eBay account is linked. Messages from buyers will appear here once you receive them.
                  If you&apos;re expecting messages, reconnect to grant full message access.
                </p>
                <a
                  href="/api/auth/ebay"
                  className="inline-flex items-center gap-2 rounded-lg border border-[var(--biz-border)] bg-white px-5 py-2.5 text-sm font-semibold text-[var(--biz-text)] transition-colors hover:bg-gray-50"
                >
                  Reconnect to refresh access
                </a>
              </>
            ) : (
              <>
                <h2 className="mb-2 text-lg font-semibold text-[var(--biz-text)]">Connect your eBay account</h2>
                <p className="mb-6 max-w-sm text-sm text-[var(--biz-muted)]">
                  Link your eBay account to sync buyer messages, inquiries, and offer negotiations.
                </p>
                <a
                  href="/api/auth/ebay"
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-500"
                >
                  Connect eBay Account
                </a>
              </>
            )}
          </div>
        </main>
      </AuthenticatedLayout>
    );
  }

  return (
    <AuthenticatedLayout>
      <main className="mx-auto max-w-7xl px-4 py-4">
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

export default function BusinessMessagesPage() {
  return (
    <Suspense
      fallback={
        <AuthenticatedLayout>
          <main className="max-w-7xl mx-auto px-4 py-4">
            <div className="animate-pulse space-y-4">
              <div className="h-8 w-48 rounded bg-[#E5E7EB]" />
              <div className="grid grid-cols-5 gap-2">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-16 rounded-lg bg-[#E5E7EB]" />
                ))}
              </div>
              <div className="h-[500px] rounded-xl bg-[#E5E7EB]" />
            </div>
          </main>
        </AuthenticatedLayout>
      }
    >
      <BusinessMessagesContent />
    </Suspense>
  );
}
