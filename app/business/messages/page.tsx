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
