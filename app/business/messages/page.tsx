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

  const loadData = useCallback(async () => {
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login?redirect=/business/messages");
        return;
      }

      // Check business access
      const accessRes = await fetch("/api/business/inventory", {
        cache: "no-store",
      });
      if (accessRes.status === 403) {
        setHasAccess(false);
        setLoading(false);
        return;
      }
      setHasAccess(true);

      // Load messaging data
      const msgRes = await fetch("/api/business/messages", {
        cache: "no-store",
      });
      if (msgRes.ok) {
        const data = await msgRes.json();
        setStats(data.stats);
        setThreads(data.threads);
      }
    } catch {
      setHasAccess(false);
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
        <main className="max-w-7xl mx-auto px-4 py-4">
          <p className="text-[var(--biz-muted)] text-sm">Unable to load messages.</p>
        </main>
      </AuthenticatedLayout>
    );
  }

  // No threads and no eBay connection — prompt to connect/reconnect
  if (stats.total_threads === 0 && threads.length === 0) {
    return (
      <AuthenticatedLayout>
        <main className="mx-auto max-w-7xl px-4 py-8">
          <h1 className="text-2xl font-bold text-[var(--biz-text)] mb-8">Messages</h1>
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--biz-border)] bg-white dark:bg-gray-900 py-20 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#F0FDF4]">
              <svg className="h-8 w-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
            </div>
            <h2 className="mb-2 text-lg font-semibold text-[var(--biz-text)]">No messages yet</h2>
            <p className="mb-6 max-w-sm text-sm text-[var(--biz-muted)]">
              Connect (or reconnect) your eBay account to sync your buyer messages, inquiries, and offer negotiations.
            </p>
            <a
              href="/api/auth/ebay"
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 transition-colors"
            >
              Connect eBay Account
            </a>
            <p className="mt-3 text-xs text-[var(--biz-muted)]">
              Already connected? Try reconnecting to grant message access.
            </p>
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
