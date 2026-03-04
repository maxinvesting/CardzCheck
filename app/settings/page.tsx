"use client";

import { Suspense } from "react";
import { useState, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import AuthenticatedLayout from "@/components/AuthenticatedLayout";
import PricingModal from "@/components/PricingModal";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@/types";
import { LIMITS } from "@/types";
import { isTestMode, getTestUser } from "@/lib/test-mode";

const EBAY_STORE_URL_STORAGE_KEY = "cardzcheck_ebay_store_url";
const EBAY_STORE_URL_UPDATED_EVENT = "cardzcheck:ebay-store-url-updated";
const EBAY_FEE_RATE_STORAGE_KEY = "cardzcheck_ebay_fee_rate";
const EBAY_FEE_RATE_UPDATED_EVENT = "cardzcheck:ebay-fee-rate-updated";

type EbayFeeRateKey = "standard" | "top_rated_plus";

function getStoredEbayFeeRate(): EbayFeeRateKey {
  if (typeof window === "undefined") return "standard";
  const stored = window.localStorage.getItem(EBAY_FEE_RATE_STORAGE_KEY);
  if (stored === "top_rated_plus") return "top_rated_plus";
  return "standard";
}

function persistEbayFeeRate(value: EbayFeeRateKey) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(EBAY_FEE_RATE_STORAGE_KEY, value);
  window.dispatchEvent(
    new CustomEvent(EBAY_FEE_RATE_UPDATED_EVENT, { detail: { value } })
  );
}

function normalizeEbayStoreUrl(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function persistEbayStoreUrl(value: string) {
  if (typeof window === "undefined") return;
  if (value) {
    window.sessionStorage.setItem(EBAY_STORE_URL_STORAGE_KEY, value);
  } else {
    window.sessionStorage.removeItem(EBAY_STORE_URL_STORAGE_KEY);
  }
  window.dispatchEvent(
    new CustomEvent(EBAY_STORE_URL_UPDATED_EVENT, { detail: { value } })
  );
}

type EbayStatus = {
  connected: boolean;
  username: string | null;
  last_inventory_sync: string | null;
  last_sales_sync: string | null;
  fee_rate: EbayFeeRateKey;
};

function SettingsContent() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [nameLoading, setNameLoading] = useState(false);
  const [businessName, setBusinessName] = useState("");
  const [businessNameLoading, setBusinessNameLoading] = useState(false);
  const [ebayStoreUrl, setEbayStoreUrl] = useState("");
  const [ebayStoreUrlLoading, setEbayStoreUrlLoading] = useState(false);
  const [ebayFeeRate, setEbayFeeRate] = useState<EbayFeeRateKey>("standard");
  const [ebayFeeRateSaving, setEbayFeeRateSaving] = useState(false);
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [websiteUrlLoading, setWebsiteUrlLoading] = useState(false);
  const [ebayStatus, setEbayStatus] = useState<EbayStatus | null>(null);
  const [ebayStatusLoading, setEbayStatusLoading] = useState(false);
  const [ebayConnectLoading, setEbayConnectLoading] = useState(false);
  const [ebayDisconnectLoading, setEbayDisconnectLoading] = useState(false);
  const [ebayBanner, setEbayBanner] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [pricingOpen, setPricingOpen] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const isBusinessSettings = pathname.startsWith("/business");

  useEffect(() => {
    if (searchParams.get("success") === "true") {
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 5000);
    }
    const ebayConnected = searchParams.get("ebay_connected");
    const ebayError = searchParams.get("ebay_error");
    if (ebayConnected === "true") {
      setEbayBanner({ type: "success", message: "eBay account connected successfully!" });
      setTimeout(() => setEbayBanner(null), 6000);
    } else if (ebayError) {
      setEbayBanner({ type: "error", message: decodeURIComponent(ebayError) });
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
        setBusinessName(testUser.business_name || "");
        setEbayStoreUrl(testUser.ebay_store_url || "");
        setEbayFeeRate(getStoredEbayFeeRate());
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
      const metadataEbayStoreUrl =
        typeof authUser.user_metadata?.ebay_store_url === "string"
          ? authUser.user_metadata.ebay_store_url
          : "";

      const { data: userData } = await supabase
        .from("users")
        .select("*")
        .eq("id", authUser.id)
        .single();

      const hasTableEbayStoreUrl =
        !!userData &&
        Object.prototype.hasOwnProperty.call(userData, "ebay_store_url");
      const resolvedEbayStoreUrl = normalizeEbayStoreUrl(
        hasTableEbayStoreUrl ? userData.ebay_store_url || "" : metadataEbayStoreUrl
      );

      if (userData) {
        setUser({
          ...userData,
          ebay_store_url: resolvedEbayStoreUrl || null,
        });
        setName(userData.name || "");
        setBusinessName(userData.business_name || "");
        setEbayStoreUrl(resolvedEbayStoreUrl);
        setWebsiteUrl(userData.website_url || "");
        // Prefer DB fee rate; fall back to localStorage
        const dbFeeRate = userData.ebay_fee_rate === "top_rated_plus" ? "top_rated_plus" : "standard";
        setEbayFeeRate(dbFeeRate);
        persistEbayFeeRate(dbFeeRate);
      } else {
        setEbayStoreUrl(normalizeEbayStoreUrl(metadataEbayStoreUrl));
        setEbayFeeRate(getStoredEbayFeeRate());
      }
      persistEbayStoreUrl(resolvedEbayStoreUrl);

      // Fetch eBay OAuth status (Business only)
      try {
        const ebayRes = await fetch("/api/ebay/status");
        if (ebayRes.ok) {
          const ebayData = await ebayRes.json();
          setEbayStatus(ebayData);
        }
      } catch {
        // Non-fatal — just don't show eBay status
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

  const handleBusinessNameUpdate = async () => {
    setBusinessNameLoading(true);
    try {
      const response = await fetch("/api/user/name", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ business_name: businessName.trim() || null }),
      });

      if (!response.ok) {
        const data = await response.json();
        alert(data.error || "Failed to update business name");
        return;
      }

      if (user) {
        setUser({ ...user, business_name: businessName.trim() || null });
      }
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 5000);
    } catch (error) {
      console.error("Error updating business name:", error);
      alert("Failed to update business name");
    } finally {
      setBusinessNameLoading(false);
    }
  };

  const handleEbayStoreUrlUpdate = async () => {
    setEbayStoreUrlLoading(true);
    try {
      const normalizedInput = normalizeEbayStoreUrl(ebayStoreUrl);
      const response = await fetch("/api/user/name", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ebay_store_url: normalizedInput || null,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        alert(data.error || "Failed to update eBay Store URL");
        return;
      }

      const savedEbayStoreUrl = normalizeEbayStoreUrl(
        data?.data?.ebay_store_url ?? normalizedInput
      );
      setEbayStoreUrl(savedEbayStoreUrl);
      persistEbayStoreUrl(savedEbayStoreUrl);

      if (user) {
        setUser({ ...user, ebay_store_url: savedEbayStoreUrl || null });
      }
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 5000);
    } catch (error) {
      console.error("Error updating eBay Store URL:", error);
      alert("Failed to update eBay Store URL");
    } finally {
      setEbayStoreUrlLoading(false);
    }
  };

  const handleEbayFeeRateChange = async (value: EbayFeeRateKey) => {
    setEbayFeeRate(value);
    persistEbayFeeRate(value);
    setEbayFeeRateSaving(true);
    try {
      await fetch("/api/user/name", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ebay_fee_rate: value }),
      });
    } catch {
      // Non-fatal — localStorage already updated
    } finally {
      setEbayFeeRateSaving(false);
    }
  };

  const handleWebsiteUrlUpdate = async () => {
    setWebsiteUrlLoading(true);
    try {
      const response = await fetch("/api/user/name", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ website_url: websiteUrl.trim() || null }),
      });
      if (!response.ok) {
        const data = await response.json();
        alert(data.error || "Failed to update website URL");
        return;
      }
      if (user) setUser({ ...user, website_url: websiteUrl.trim() || null });
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 5000);
    } catch {
      alert("Failed to update website URL");
    } finally {
      setWebsiteUrlLoading(false);
    }
  };

  const handleEbayConnect = () => {
    setEbayConnectLoading(true);
    window.location.href = "/api/ebay/connect";
  };

  const handleEbayDisconnect = async () => {
    if (!confirm("Disconnect your eBay account? You can reconnect at any time.")) return;
    setEbayDisconnectLoading(true);
    try {
      const res = await fetch("/api/ebay/disconnect", { method: "POST" });
      if (res.ok) {
        setEbayStatus((prev) => prev ? { ...prev, connected: false, username: null } : null);
        setEbayBanner({ type: "success", message: "eBay account disconnected." });
        setTimeout(() => setEbayBanner(null), 5000);
      } else {
        const data = await res.json();
        alert(data.error || "Failed to disconnect eBay account");
      }
    } catch {
      alert("Failed to disconnect eBay account");
    } finally {
      setEbayDisconnectLoading(false);
    }
  };

  const handleEbayInventorySync = async () => {
    setEbayStatusLoading(true);
    try {
      const res = await fetch("/api/ebay/inventory/sync", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setEbayStatus((prev) => prev ? { ...prev, last_inventory_sync: data.synced_at } : prev);
        setEbayBanner({
          type: "success",
          message: `Inventory synced: ${data.added} added, ${data.updated} updated.`,
        });
        setTimeout(() => setEbayBanner(null), 6000);
      } else {
        alert(data.error || "Inventory sync failed");
      }
    } catch {
      alert("Inventory sync failed");
    } finally {
      setEbayStatusLoading(false);
    }
  };

  const handleEbaySalesSync = async () => {
    setEbayStatusLoading(true);
    try {
      const res = await fetch("/api/ebay/sales/sync", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setEbayStatus((prev) => prev ? { ...prev, last_sales_sync: data.synced_at } : prev);
        setEbayBanner({
          type: "success",
          message: `Sales synced: ${data.imported} imported, ${data.skipped} skipped.`,
        });
        setTimeout(() => setEbayBanner(null), 6000);
      } else {
        alert(data.error || "Sales sync failed");
      }
    } catch {
      alert("Sales sync failed");
    } finally {
      setEbayStatusLoading(false);
    }
  };

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  };

  const handleUpgrade = () => {
    setPricingOpen(true);
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
              {isBusinessSettings && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Business Name
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                      placeholder="Your business name"
                      maxLength={120}
                      className="flex-1 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <button
                      onClick={handleBusinessNameUpdate}
                      disabled={
                        businessNameLoading ||
                        businessName === (user?.business_name || "")
                      }
                      className="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {businessNameLoading ? "Saving..." : "Save"}
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Used as your Business workspace title
                  </p>
                </div>
              )}
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

          {isBusinessSettings && (
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Sales Channels
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    eBay Store URL
                  </label>
                  <div className="flex gap-2 flex-wrap sm:flex-nowrap">
                    <input
                      type="url"
                      value={ebayStoreUrl}
                      onChange={(e) => setEbayStoreUrl(e.target.value)}
                      placeholder="https://www.ebay.com/str/yourstore"
                      maxLength={2048}
                      className="flex-1 min-w-0 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <button
                      onClick={handleEbayStoreUrlUpdate}
                      disabled={
                        ebayStoreUrlLoading ||
                        ebayStoreUrl === (user?.ebay_store_url || "")
                      }
                      className="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                    >
                      {ebayStoreUrlLoading ? "Saving..." : "Save"}
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Opens from Business mode via the Open Store shortcut
                  </p>
                </div>

                {/* eBay Fee Rate Setting */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    eBay Fee Rate
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEbayFeeRateChange("standard")}
                      disabled={ebayFeeRateSaving}
                      className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium border transition-colors disabled:opacity-50 ${
                        ebayFeeRate === "standard"
                          ? "bg-blue-600 text-white border-blue-600"
                          : "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700"
                      }`}
                    >
                      Standard — 13%
                    </button>
                    <button
                      onClick={() => handleEbayFeeRateChange("top_rated_plus")}
                      disabled={ebayFeeRateSaving}
                      className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium border transition-colors disabled:opacity-50 ${
                        ebayFeeRate === "top_rated_plus"
                          ? "bg-blue-600 text-white border-blue-600"
                          : "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700"
                      }`}
                    >
                      Top Rated Plus — 12%
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Used to calculate eBay Parity Price in your inventory and shop listings
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Website URL */}
          {isBusinessSettings && (
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Your Website
              </h2>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Website URL
                </label>
                <div className="flex gap-2 flex-wrap sm:flex-nowrap">
                  <input
                    type="url"
                    value={websiteUrl}
                    onChange={(e) => setWebsiteUrl(e.target.value)}
                    placeholder="https://yourstore.com"
                    maxLength={2048}
                    className="flex-1 min-w-0 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <button
                    onClick={handleWebsiteUrlUpdate}
                    disabled={websiteUrlLoading || websiteUrl === (user?.website_url || "")}
                    className="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                  >
                    {websiteUrlLoading ? "Saving..." : "Save"}
                  </button>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Your personal or business website
                </p>
              </div>
            </div>
          )}

          {/* eBay Integrations */}
          {isBusinessSettings && (
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                Integrations
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
                Connect your eBay seller account to sync inventory and sales automatically.
              </p>

              {/* eBay OAuth banner */}
              {ebayBanner && (
                <div className={`mb-4 p-3 rounded-lg text-sm border ${
                  ebayBanner.type === "success"
                    ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-800 dark:text-green-200"
                    : "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200"
                }`}>
                  {ebayBanner.message}
                </div>
              )}

              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-gray-900 dark:text-white">eBay Seller Account</span>
                    {ebayStatus?.connected ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800">
                        Connected
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700">
                        Not connected
                      </span>
                    )}
                  </div>
                  {ebayStatus?.connected && ebayStatus.username && (
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Connected as <span className="font-medium text-gray-700 dark:text-gray-300">{ebayStatus.username}</span>
                    </p>
                  )}
                  {ebayStatus?.connected && (
                    <div className="mt-1.5 text-xs text-gray-400 dark:text-gray-500 space-y-0.5">
                      {ebayStatus.last_inventory_sync && (
                        <p>Inventory synced: {new Date(ebayStatus.last_inventory_sync).toLocaleDateString()}</p>
                      )}
                      {ebayStatus.last_sales_sync && (
                        <p>Sales synced: {new Date(ebayStatus.last_sales_sync).toLocaleDateString()}</p>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {ebayStatus?.connected ? (
                    <>
                      <button
                        onClick={handleEbayInventorySync}
                        disabled={ebayStatusLoading}
                        className="px-3 py-1.5 text-xs font-medium border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
                      >
                        {ebayStatusLoading ? "Syncing..." : "Sync Inventory"}
                      </button>
                      <button
                        onClick={handleEbaySalesSync}
                        disabled={ebayStatusLoading}
                        className="px-3 py-1.5 text-xs font-medium border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
                      >
                        {ebayStatusLoading ? "Syncing..." : "Sync Sales"}
                      </button>
                      <button
                        onClick={handleEbayDisconnect}
                        disabled={ebayDisconnectLoading}
                        className="px-3 py-1.5 text-xs font-medium border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
                      >
                        {ebayDisconnectLoading ? "Disconnecting..." : "Disconnect"}
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={handleEbayConnect}
                      disabled={ebayConnectLoading}
                      className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                    >
                      {ebayConnectLoading ? "Connecting..." : "Connect eBay"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

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
                    className="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Upgrade
                  </button>
                </div>

                <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Upgrade and get:
                  </p>
                  <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                    <li>• Unlimited searches</li>
                    <li>• Unlimited collection tracking</li>
                    <li>• Collection value tracking</li>
                    <li>• One-time payment, lifetime access</li>
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
      <PricingModal isOpen={pricingOpen} onClose={() => setPricingOpen(false)} />
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
