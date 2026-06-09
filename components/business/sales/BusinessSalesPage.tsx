"use client";

import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import BusinessPaywall from "@/components/business/BusinessPaywall";
// Heavy terminal (~960 lines + messaging deps) — split into its own chunk so it
// doesn't bloat the sales page's initial bundle.
const SalesAgentTerminal = dynamic(
  () => import("@/components/business/messaging/SalesAgentTerminal"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center p-8 text-[var(--biz-muted)]">
        Loading…
      </div>
    ),
  }
);
import { createClient } from "@/lib/supabase/client";
import type { MessageThread, MessagingStats } from "@/lib/messaging/types";

export default function BusinessSalesPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [stats, setStats] = useState<MessagingStats | null>(null);
  const [threads, setThreads] = useState<MessageThread[]>([]);
  const [msgError, setMsgError] = useState<string | null>(null);
  const [businessName, setBusinessName] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setMsgError(null);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login?redirect=/marketplace/sell/messages");
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
        router.push("/login?redirect=/marketplace/sell/messages");
        return;
      }
      setHasAccess(true);

      const msgRes = await fetch("/api/business/messages", {
        cache: "no-store",
      });
      if (msgRes.status === 401) {
        router.push("/login?redirect=/marketplace/sell/messages");
        return;
      }
      if (msgRes.ok) {
        const data = await msgRes.json();
        setStats(data.stats);
        setThreads(data.threads);
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
      <>
        <main className="sales-mono-theme min-h-screen px-3 py-3">
          <div className="animate-pulse space-y-3">
            <div className="h-12 w-72 rounded bg-[var(--biz-skeleton)]" />
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-20 rounded-md bg-[var(--biz-skeleton)]" />
              ))}
            </div>
            <div className="h-24 rounded-md bg-[var(--biz-skeleton)]" />
            <div className="h-10 rounded-md bg-[var(--biz-skeleton)]" />
            <div className="h-[520px] rounded-md bg-[var(--biz-skeleton)]" />
          </div>
        </main>
      </>
    );
  }

  if (hasAccess === false) {
    return (
      <>
        <main className="sales-mono-theme min-h-screen px-4 py-4">
          <BusinessPaywall />
        </main>
      </>
    );
  }

  if (!stats) {
    return (
      <>
        <main className="sales-mono-theme min-h-screen px-4 py-8">
          <div className="mx-auto flex max-w-xl flex-col items-center justify-center rounded-md border border-dashed border-[var(--biz-border)] bg-[var(--biz-surface)] py-12 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-md border border-[var(--biz-danger-border)] bg-[var(--biz-danger-soft)]">
              <svg className="h-6 w-6 text-[var(--biz-danger)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
            </div>
            <h2 className="text-[15px] font-semibold text-[var(--biz-text)]">
              Unable to load messages
            </h2>
            <p className="mt-1 max-w-sm text-[12px] text-[var(--biz-muted)]">
              {msgError ?? "Something went wrong loading your inbox. Try refreshing."}
            </p>
            <div className="mt-5 flex gap-2">
              <button
                onClick={() => {
                  setLoading(true);
                  loadData();
                }}
                className="rounded bg-[var(--biz-primary)] px-3 py-1.5 text-[12px] font-semibold text-[var(--biz-primary-foreground)] transition-colors hover:bg-[var(--biz-primary-hover)]"
              >
                Try Again
              </button>
              <a
                href="/marketplace/sell/listings"
                className="rounded border border-[var(--biz-border)] bg-[var(--biz-surface-soft)] px-3 py-1.5 text-[12px] font-semibold text-[var(--biz-text)] transition-colors hover:bg-[var(--biz-hover)]"
              >
                View your listings
              </a>
            </div>
          </div>
        </main>
      </>
    );
  }

  if (stats.total_threads === 0 && threads.length === 0) {
    return (
      <>
        <main className="sales-mono-theme min-h-screen px-4 py-8">
          <div className="mx-auto flex max-w-xl flex-col items-center justify-center rounded-md border border-dashed border-[var(--biz-border)] bg-[var(--biz-surface)] py-12 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-md border border-[var(--biz-primary-border)] bg-[var(--biz-primary-soft)]">
              <svg className="h-6 w-6 text-[var(--biz-primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
            </div>
            <h2 className="text-[15px] font-semibold text-[var(--biz-text)]">
              No messages yet
            </h2>
            <p className="mt-1 max-w-md text-[12px] leading-relaxed text-[var(--biz-muted)]">
              Buyer questions and offers on your marketplace listings will show up here. List inventory to start getting messages.
            </p>
            <a
              href="/marketplace/sell/listings"
              className="mt-5 rounded bg-[var(--biz-primary)] px-3 py-1.5 text-[12px] font-semibold text-[var(--biz-primary-foreground)] transition-colors hover:bg-[var(--biz-primary-hover)]"
            >
              View your listings
            </a>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <main className="sales-mono-theme flex h-screen flex-col overflow-hidden">
        <SalesAgentTerminal
          initialStats={stats}
          initialThreads={threads}
          businessName={businessName}
        />
      </main>
    </>
  );
}
