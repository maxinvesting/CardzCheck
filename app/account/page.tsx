"use client";

import { Suspense } from "react";
import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AuthenticatedLayout from "@/components/AuthenticatedLayout";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@/types";
import { LIMITS } from "@/types";
import { isTestMode, getTestUser } from "@/lib/test-mode";

function AccountContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [upgradeLoading, setUpgradeLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    if (searchParams.get("success") === "true") {
      setShowSuccess(true);
    }
  }, [searchParams]);

  useEffect(() => {
    async function loadUser() {
      // In test mode, use mock user
      if (isTestMode()) {
        const testUser = getTestUser();
        setUser(testUser);
        setEmail(testUser.email);
        setLoading(false);
        console.log("🧪 TEST MODE: Using mock user in Account");
        return;
      }

      const supabase = createClient();
      const { data: { user: authUser } } = await supabase.auth.getUser();

      if (!authUser) {
        router.push("/login?redirect=/account");
        return;
      }

      setEmail(authUser.email || "");

      const { data: userData } = await supabase
        .from("users")
        .select("*")
        .eq("id", authUser.id)
        .single();

      if (userData) {
        setUser(userData);
      }

      setLoading(false);
    }

    loadUser();
  }, [router]);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  };

  const handleUpgrade = async () => {
    setUpgradeLoading(true);

    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
      });

      const data = await response.json();

      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      console.error("Checkout error:", error);
      setUpgradeLoading(false);
    }
  };

  if (loading) {
    return (
      <AuthenticatedLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      </AuthenticatedLayout>
    );
  }

  return (
    <AuthenticatedLayout>
      <main className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-8">
          Account
        </h1>

        {showSuccess && (
          <div className="mb-8 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl">
            <div className="flex items-center gap-3">
              <svg className="w-6 h-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <div>
                <p className="font-medium text-green-800 dark:text-green-200">
                  Payment successful!
                </p>
                <p className="text-sm text-green-600 dark:text-green-400">
                  You now have unlimited access to CardzCheck.
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-6">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Account Information
            </h2>
            <div className="space-y-3">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Email</p>
                <p className="text-gray-900 dark:text-white">{email}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Member since</p>
                <p className="text-gray-900 dark:text-white">
                  {user?.created_at
                    ? new Date(user.created_at).toLocaleDateString("en-US", {
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                      })
                    : "-"}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Your Plan
            </h2>

            {user?.is_paid ? (
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
                  <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">Pro</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Unlimited searches and collection
                  </p>
                </div>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">Free</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {user?.free_searches_used || 0}/{LIMITS.FREE_SEARCHES} searches used
                    </p>
                  </div>
                  <button
                    onClick={handleUpgrade}
                    disabled={upgradeLoading}
                    className="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                  >
                    {upgradeLoading ? "Loading..." : "Upgrade to Pro - $20"}
                  </button>
                </div>

                <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Pro includes:
                  </p>
                  <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                    <li>• Unlimited searches</li>
                    <li>• Unlimited collection tracking</li>
                    <li>• Portfolio value tracking</li>
                  </ul>
                </div>
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Session
            </h2>
            <button
              onClick={handleLogout}
              className="px-4 py-2 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Log out
            </button>
          </div>
        </div>
      </main>
    </AuthenticatedLayout>
  );
}

export default function AccountPage() {
  return (
    <Suspense fallback={
      <AuthenticatedLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      </AuthenticatedLayout>
    }>
      <AccountContent />
    </Suspense>
  );
}
