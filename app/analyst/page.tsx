"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AuthenticatedLayout from "@/components/AuthenticatedLayout";
import CardAnalyst from "@/components/CardAnalyst";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@/types";
import { isTestMode, getTestUser } from "@/lib/test-mode";

const ANALYST_QUERY_LIMIT = 100;

interface CardContext {
  playerName?: string;
  year?: string;
  setName?: string;
  grade?: string;
  recentSales?: Array<{ price: number; date: string }>;
  avgPrice?: number;
  priceChange30d?: number;
}

function AnalystPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [cardContext, setCardContext] = useState<CardContext | undefined>();
  const [analystQueriesUsed, setAnalystQueriesUsed] = useState(0);

  useEffect(() => {
    async function loadUser() {
      // In test mode, use mock user
      if (isTestMode()) {
        const testUser = getTestUser();
        setUser({ ...testUser, is_paid: true });
        setLoading(false);
        console.log("🧪 TEST MODE: Using mock user in CardzCheck Analyst");
        return;
      }

      const supabase = createClient();

      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();

      if (!authUser) {
        router.push("/login?redirect=/analyst");
        return;
      }

      // Get user data
      const { data: userData } = await supabase
        .from("users")
        .select("*")
        .eq("id", authUser.id)
        .single();

      if (userData) {
        setUser(userData as User);
        setAnalystQueriesUsed(
          (userData as Record<string, unknown>).analyst_queries_used as number || 0
        );
      }

      setLoading(false);
    }

    loadUser();
  }, [router]);

  // Parse card context from URL params
  useEffect(() => {
    const player = searchParams.get("player");
    const year = searchParams.get("year");
    const set = searchParams.get("set");
    const grade = searchParams.get("grade");
    const avg = searchParams.get("avg");
    const change = searchParams.get("change");

    if (player || year || set || grade) {
      setCardContext({
        playerName: player || undefined,
        year: year || undefined,
        setName: set || undefined,
        grade: grade || undefined,
        avgPrice: avg ? parseFloat(avg) : undefined,
        priceChange30d: change ? parseFloat(change) : undefined,
      });
    }
  }, [searchParams]);

  const isPaid = user?.is_paid ?? false;
  const remainingQueries = isPaid ? ANALYST_QUERY_LIMIT - analystQueriesUsed : 0;

  if (loading) {
    return (
      <AuthenticatedLayout>
        <div className="h-screen flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500" />
        </div>
      </AuthenticatedLayout>
    );
  }

  // Show upgrade prompt for free users
  if (!isPaid) {
    return (
      <AuthenticatedLayout>
        <div className="h-screen flex items-center justify-center p-4">
          <div className="max-w-md text-center">
            <div className="p-4 bg-purple-500/20 rounded-full inline-flex mb-6">
              <svg
                className="w-12 h-12 text-purple-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-white mb-3">
              CardzCheck Analyst is a Pro Feature
            </h1>
            <p className="text-gray-400 mb-6">
              Get insights on card values, investment potential, and
              market trends. Upgrade to Pro to unlock CardzCheck Analyst.
            </p>
            <div className="space-y-3">
              <button
                onClick={async () => {
                  const response = await fetch("/api/checkout", {
                    method: "POST",
                  });
                  const data = await response.json();
                  if (data.url) {
                    window.location.href = data.url;
                  }
                }}
                className="w-full px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-xl transition-colors"
              >
                Upgrade to Pro
              </button>
              <button
                onClick={() => router.push("/dashboard")}
                className="w-full px-6 py-3 bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium rounded-xl transition-colors"
              >
                Back to Dashboard
              </button>
            </div>
          </div>
        </div>
      </AuthenticatedLayout>
    );
  }

  return (
    <AuthenticatedLayout>
      <div className="h-screen flex flex-col">
        {/* Page Header - Mobile only, desktop has header in component */}
        <div className="lg:hidden p-4 border-b border-gray-800">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
            Back
          </button>
        </div>

        {/* CardzCheck Analyst Component - Full height */}
        <div className="flex-1 overflow-hidden">
          <CardAnalyst
            cardContext={cardContext}
            remainingQueries={remainingQueries}
            totalQueries={ANALYST_QUERY_LIMIT}
          />
        </div>
      </div>
    </AuthenticatedLayout>
  );
}

export default function AnalystPage() {
  return (
    <Suspense
      fallback={
        <AuthenticatedLayout>
          <div className="h-screen flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500" />
          </div>
        </AuthenticatedLayout>
      }
    >
      <AnalystPageContent />
    </Suspense>
  );
}
