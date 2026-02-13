"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AuthenticatedLayout from "@/components/AuthenticatedLayout";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@/types";
import { LIMITS } from "@/types";
import { isTestMode, getTestUser } from "@/lib/test-mode";

function SettingsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [nameLoading, setNameLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [upgradeLoading, setUpgradeLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (searchParams.get("success") === "true") {
      setShowSuccess(true);
      // Auto-hide after 5 seconds
      setTimeout(() => setShowSuccess(false), 5000);
    }
  }, [searchParams]);

  useEffect(() => {
    async function loadUser() {
      // In test mode, use mock user
      if (isTestMode()) {
        const testUser = getTestUser();
        setUser(testUser);
        setEmail(testUser.email);
        setName(testUser.name || "");
        setLoading(false);
        console.log("🧪 TEST MODE: Using mock user in Settings");
        return;
      }

      const supabase = createClient();
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();

      if (!authUser) {
        router.push("/login?redirect=/settings");
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
        setName(userData.name || "");
      }

      setLoading(false);
    }

    loadUser();
  }, [router]);

  const handleNameUpdate = async () => {
    setNameLoading(true);
    try {
      const response = await fetch("/api/user/name", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() || null }),
      });

      if (!response.ok) {
        const data = await response.json();
        alert(data.error || "Failed to update name");
        return;
      }

      // Update local user state
      if (user) {
        setUser({ ...user, name: name.trim() || null });
      }
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 5000);
    } catch (error) {
      console.error("Error updating name:", error);
      alert("Failed to update name");
    } finally {
      setNameLoading(false);
    }
  };

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

  const handleDeleteAccount = async () => {
    // In a real implementation, you would have a delete account API endpoint
    // For now, we'll just sign out
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
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
          Settings
        </h1>

        {showSuccess && (
          <div className="mb-8 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl">
            <div className="flex items-center gap-3">
              <svg
                className="w-6 h-6 text-green-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
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
          {/* Account Information */}
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Account Information
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Name
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your name"
                    maxLength={100}
                    className="flex-1 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <button
                    onClick={handleNameUpdate}
                    disabled={nameLoading || name === (user?.name || "")}
                    className="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {nameLoading ? "Saving..." : "Save"}
                  </button>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  This name will be used for personalization throughout the app
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  disabled
                  className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white cursor-not-allowed"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Contact support to change your email address
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Member Since
                </label>
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

          {/* Current Plan */}
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Current Plan
            </h2>

            {user?.is_paid ? (
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
                    <svg
                      className="w-6 h-6 text-blue-600 dark:text-blue-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-lg font-semibold text-gray-900 dark:text-white">
                        Pro Member
                      </p>
                      <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-xs font-medium rounded">
                        Pro
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Unlimited searches and collection tracking
                    </p>
                  </div>
                </div>

                <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Your Pro features:
                  </p>
                  <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                    <li className="flex items-center gap-2">
                      <svg
                        className="w-4 h-4 text-green-500"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                      Unlimited searches
                    </li>
                    <li className="flex items-center gap-2">
                      <svg
                        className="w-4 h-4 text-green-500"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                      Unlimited collection tracking
                    </li>
                    <li className="flex items-center gap-2">
                      <svg
                        className="w-4 h-4 text-green-500"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                      Collection value tracking
                    </li>
                  </ul>
                </div>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-lg font-semibold text-gray-900 dark:text-white">
                      Free Plan
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {user?.free_searches_used || 0}/{LIMITS.FREE_SEARCHES}{" "}
                      searches used
                    </p>
                  </div>
                  <button
                    onClick={handleUpgrade}
                    disabled={upgradeLoading}
                    className="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                  >
                    {upgradeLoading ? "Loading..." : "Upgrade to Pro"}
                  </button>
                </div>

                <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Upgrade to Pro and get:
                  </p>
                  <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                    <li>• Unlimited searches</li>
                    <li>• Unlimited collection tracking</li>
                    <li>• Collection value tracking</li>
                  </ul>
                </div>
              </div>
            )}
          </div>

          {/* Password */}
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Password
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Password changes are not currently supported. Contact support if
              you need to reset your password.
            </p>
          </div>

          {/* Session */}
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

          {/* Danger Zone */}
          <div className="bg-white dark:bg-gray-900 border border-red-200 dark:border-red-800 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-red-600 dark:text-red-400 mb-4">
              Danger Zone
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Once you delete your account, there is no going back. This action
              will permanently delete your account and all associated data.
            </p>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              Delete Account
            </button>
          </div>
        </div>

        {/* Delete Confirmation Modal */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl max-w-md w-full p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                Delete Account
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                Are you sure you want to delete your account? This action cannot
                be undone and will permanently delete all your data.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteAccount}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                >
                  Delete Account
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </AuthenticatedLayout>
  );
}

export default function SettingsPage() {
  return (
    <Suspense
      fallback={
        <AuthenticatedLayout>
          <div className="flex items-center justify-center min-h-screen">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        </AuthenticatedLayout>
      }
    >
      <SettingsContent />
    </Suspense>
  );
}
