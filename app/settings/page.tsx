"use client";

import { Suspense } from "react";
import { useState, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import PricingModal from "@/components/PricingModal";
import AppearanceSettingsCard from "@/components/business/settings/AppearanceSettingsCard";
import EbayConnectSection from "@/components/business/settings/EbayConnectSection";
import StorefrontsSection from "@/components/business/settings/StorefrontsSection";
import TeamManagementSection from "@/components/business/settings/TeamManagementSection";
import { createClient } from "@/lib/supabase/client";
import { hasActiveBusinessTier } from "@/lib/subscription-tier";
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
  const [subscription, setSubscription] = useState<{
    tier?: string | null;
    status?: string | null;
    current_period_end?: string | null;
  } | null>(null);
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
  const [hasBusinessWorkspace, setHasBusinessWorkspace] = useState(false);
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
        setSubscription(testUser.subscription ?? null);
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

      const [{ data: userData }, { data: subscriptionData }] = await Promise.all([
        supabase.from("users").select("*").eq("id", authUser.id).single(),
        supabase
          .from("subscriptions")
          .select("tier, status, current_period_end")
          .eq("user_id", authUser.id)
          .maybeSingle(),
      ]);
      setSubscription(subscriptionData ?? null);

      const legacyBusinessAccess =
        Boolean(userData?.is_paid) && hasActiveBusinessTier(subscriptionData);
      let membershipBusinessAccess = false;
      const { data: membershipRows, error: membershipError } = await supabase
        .from("business_memberships")
        .select("business_account_id")
        .eq("user_id", authUser.id)
        .eq("status", "active")
        .limit(1);

      if (!membershipError) {
        membershipBusinessAccess = (membershipRows?.length ?? 0) > 0;
      } else if (
        !["42P01", "42703", "PGRST205"].includes(membershipError.code || "")
      ) {
        console.warn("Failed to resolve business membership access:", membershipError);
      }

      setHasBusinessWorkspace(legacyBusinessAccess || membershipBusinessAccess);

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
      <>
        <div className="flex items-center justify-center min-h-screen">
          <div
            className="animate-spin rounded-full h-8 w-8 border-b-2"
            style={{
              borderBottomColor: pathname.startsWith("/business")
                ? "var(--biz-primary)"
                : "#2563EB",
            }}
          />
        </div>
      </>
    );
  }

  const isBusinessMember = hasBusinessWorkspace;
  const paidPlanName = isBusinessMember ? "Business Workspace" : "Pro Member";
  const paidPlanBadge = isBusinessMember ? "Business" : "Pro";
  const paidPlanDescription = isBusinessMember
    ? "Team workspace with inventory, sales analytics, and shared operations"
    : "Unlimited searches and collection tracking";
  const paidPlanFeatures = isBusinessMember
    ? [
        "Business base includes 1 user",
        "Add extra team seats for $5/month each",
        "Shared inventory and sales workflows",
        "Revenue & profit dashboards",
        "Owner-managed billing and seat controls",
      ]
    : [
        "Unlimited searches",
        "Unlimited collection tracking",
        "Collection value tracking",
      ];
  const businessSectionClass =
    "rounded-2xl border border-[var(--biz-border)] bg-[var(--biz-surface)] p-6 shadow-[var(--biz-shadow-sm)]";
  const businessInputClass =
    "w-full rounded-lg border border-[var(--biz-border)] bg-[var(--biz-surface-soft)] px-4 py-2 text-[var(--biz-text)] placeholder:text-[var(--biz-muted)] focus:border-[var(--biz-primary-border)] focus:outline-none focus:ring-2 focus:ring-[var(--biz-focus)]";
  const businessPrimaryButtonClass =
    "rounded-lg px-4 py-2 font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 bg-[var(--biz-primary)] text-[var(--biz-primary-foreground)] hover:bg-[var(--biz-primary-hover)]";
  const businessSecondaryButtonClass =
    "rounded-lg border border-[var(--biz-border)] px-4 py-2 font-medium text-[var(--biz-text)] transition-colors hover:bg-[var(--biz-hover)] disabled:cursor-not-allowed disabled:opacity-50";
  const showBusinessAppearanceCard = isBusinessSettings;
  const showBusinessAppearanceShortcut =
    !isBusinessSettings && hasBusinessWorkspace;

  return (
    <>
      <div className={isBusinessSettings ? "min-h-screen bg-[var(--biz-bg)]" : "min-h-screen bg-[#0b2347]"}>
        <main className={`max-w-4xl mx-auto px-4 py-10 ${isBusinessSettings ? "text-[var(--biz-text)]" : "text-white"}`}>
          <h1 className={`mb-8 text-3xl font-bold ${isBusinessSettings ? "text-[var(--biz-text)]" : "text-white"}`}>
            Settings
          </h1>

        {showSuccess && (
          <div className={`mb-8 rounded-xl border p-4 ${isBusinessSettings ? "border-[var(--biz-primary-border)] bg-[var(--biz-primary-soft)]" : "border-emerald-300/30 bg-emerald-500/15"}`}>
            <div className="flex items-center gap-3">
              <svg
                className={`w-6 h-6 ${isBusinessSettings ? "text-[var(--biz-primary)]" : "text-green-500"}`}
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
                <p className={`font-medium ${isBusinessSettings ? "text-[var(--biz-text)]" : "text-emerald-200"}`}>
                  Payment successful!
                </p>
                <p className={`text-sm ${isBusinessSettings ? "text-[var(--biz-muted)]" : "text-emerald-100/90"}`}>
                  You now have unlimited access to CardzCheck.
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-6">
          {showBusinessAppearanceShortcut && (
            <div className="rounded-2xl border border-emerald-300/30 bg-emerald-500/15 p-6 backdrop-blur-sm">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-emerald-100">
                    Business Workspace Appearance
                  </h2>
                  <p className="mt-1 text-sm text-emerald-50/90">
                    Your business colors now live in business-mode settings.
                    Use that page to set the shared 3-color workspace palette.
                  </p>
                </div>
                <button
                  onClick={() => router.push("/business/settings")}
                  className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-400"
                >
                  Open Business Settings
                </button>
              </div>
            </div>
          )}

          {/* Account Information */}
          <div className={isBusinessSettings ? businessSectionClass : "bg-white/5 border border-white/15 rounded-2xl p-6 backdrop-blur-sm"}>
            <h2 className={`mb-4 text-lg font-semibold ${isBusinessSettings ? "text-[var(--biz-text)]" : "text-white"}`}>
              Account Information
            </h2>
            <div className="space-y-4">
              <div>
                <label className={`mb-2 block text-sm font-medium ${isBusinessSettings ? "text-[var(--biz-text)]" : "text-white/85"}`}>
                  Name
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your name"
                    maxLength={100}
                    className={isBusinessSettings ? businessInputClass : "flex-1 px-4 py-2 bg-[#10294a] border border-white/20 rounded-lg text-white placeholder:text-white/45 focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-transparent"}
                  />
                  <button
                    onClick={handleNameUpdate}
                    disabled={nameLoading || name === (user?.name || "")}
                    className={isBusinessSettings ? businessPrimaryButtonClass : "px-4 py-2 bg-blue-500 text-white font-medium rounded-lg hover:bg-blue-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"}
                  >
                    {nameLoading ? "Saving..." : "Save"}
                  </button>
                </div>
                <p className={`mt-1 text-xs ${isBusinessSettings ? "text-[var(--biz-muted)]" : "text-white/60"}`}>
                  This name will be used for personalization throughout the app
                </p>
              </div>
              {isBusinessSettings && (
                <div>
                  <label className="mb-2 block text-sm font-medium text-[var(--biz-text)]">
                    Business Name
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                      placeholder="Your business name"
                      maxLength={120}
                      className={businessInputClass}
                    />
                    <button
                      onClick={handleBusinessNameUpdate}
                      disabled={
                        businessNameLoading ||
                        businessName === (user?.business_name || "")
                      }
                      className={businessPrimaryButtonClass}
                    >
                      {businessNameLoading ? "Saving..." : "Save"}
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-[var(--biz-muted)]">
                    Used as your Business workspace title
                  </p>
                </div>
              )}
              <div>
                <label className={`mb-2 block text-sm font-medium ${isBusinessSettings ? "text-[var(--biz-text)]" : "text-white/85"}`}>
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  disabled
                  className={isBusinessSettings ? `${businessInputClass} cursor-not-allowed bg-[var(--biz-surface-soft)] text-[var(--biz-muted)]` : "w-full px-4 py-2 bg-[#10294a]/80 border border-white/20 rounded-lg text-white/80 cursor-not-allowed"}
                />
                <p className={`mt-1 text-xs ${isBusinessSettings ? "text-[var(--biz-muted)]" : "text-white/60"}`}>
                  Contact support to change your email address
                </p>
              </div>
              <div>
                <label className={`mb-2 block text-sm font-medium ${isBusinessSettings ? "text-[var(--biz-text)]" : "text-white/85"}`}>
                  Member Since
                </label>
                <p className={isBusinessSettings ? "text-[var(--biz-text)]" : "text-white"}>
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

          {showBusinessAppearanceCard && <AppearanceSettingsCard />}

          {isBusinessSettings && isBusinessMember && (
            <div className={businessSectionClass}>
              <h2 className="mb-4 text-lg font-semibold text-[var(--biz-text)]">
                Storefronts
              </h2>
              <StorefrontsSection />
            </div>
          )}

          {isBusinessSettings && (
            <div className={businessSectionClass}>
                {/* eBay Fee Rate Setting */}
                <div>
                  <label className="mb-2 block text-sm font-medium text-[var(--biz-text)]">
                    eBay Fee Rate
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEbayFeeRateChange("standard")}
                      disabled={ebayFeeRateSaving}
                      className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium border transition-colors disabled:opacity-50 ${
                        ebayFeeRate === "standard"
                          ? "border-[var(--biz-primary)] bg-[var(--biz-primary)] text-[var(--biz-primary-foreground)]"
                          : "border-[var(--biz-border)] bg-[var(--biz-surface-soft)] text-[var(--biz-text)] hover:bg-[var(--biz-hover)]"
                      }`}
                    >
                      Standard — 13%
                    </button>
                    <button
                      onClick={() => handleEbayFeeRateChange("top_rated_plus")}
                      disabled={ebayFeeRateSaving}
                      className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium border transition-colors disabled:opacity-50 ${
                        ebayFeeRate === "top_rated_plus"
                          ? "border-[var(--biz-primary)] bg-[var(--biz-primary)] text-[var(--biz-primary-foreground)]"
                          : "border-[var(--biz-border)] bg-[var(--biz-surface-soft)] text-[var(--biz-text)] hover:bg-[var(--biz-hover)]"
                      }`}
                    >
                      Top Rated Plus — 12%
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-[var(--biz-muted)]">
                    Used to calculate eBay Parity Price in your inventory and shop listings
                  </p>
                </div>
            </div>
          )}

          {/* Website URL */}
          {isBusinessSettings && (
            <div className={businessSectionClass}>
              <h2 className="mb-4 text-lg font-semibold text-[var(--biz-text)]">
                Your Website
              </h2>
              <div>
                <label className="mb-2 block text-sm font-medium text-[var(--biz-text)]">
                  Website URL
                </label>
                <div className="flex gap-2 flex-wrap sm:flex-nowrap">
                  <input
                    type="url"
                    value={websiteUrl}
                    onChange={(e) => setWebsiteUrl(e.target.value)}
                    placeholder="https://yourstore.com"
                    maxLength={2048}
                    className={`${businessInputClass} min-w-0 flex-1`}
                  />
                  <button
                    onClick={handleWebsiteUrlUpdate}
                    disabled={websiteUrlLoading || websiteUrl === (user?.website_url || "")}
                    className={`${businessPrimaryButtonClass} shrink-0`}
                  >
                    {websiteUrlLoading ? "Saving..." : "Save"}
                  </button>
                </div>
                <p className="mt-1 text-xs text-[var(--biz-muted)]">
                  Your personal or business website
                </p>
              </div>
            </div>
          )}

          {/* eBay Integrations */}
          {isBusinessSettings && (
            <div className={businessSectionClass}>
              <h2 className="mb-1 text-lg font-semibold text-[var(--biz-text)]">
                Integrations
              </h2>
              <p className="mb-5 text-sm text-[var(--biz-muted)]">
                Connect your eBay seller account to sync inventory and sales automatically.
              </p>

              {/* eBay OAuth banner */}
              {ebayBanner && (
                <div className={`mb-4 p-3 rounded-lg text-sm border ${
                  ebayBanner.type === "success"
                    ? "border-[var(--biz-secondary-border)] bg-[var(--biz-secondary-soft)] text-[var(--biz-secondary)]"
                    : "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200"
                }`}>
                  {ebayBanner.message}
                </div>
              )}

              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-[var(--biz-text)]">eBay Seller Account</span>
                    {ebayStatus?.connected ? (
                      <span className="inline-flex items-center rounded-full border border-[var(--biz-secondary-border)] bg-[var(--biz-secondary-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--biz-secondary)]">
                        Connected
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full border border-[var(--biz-border)] bg-[var(--biz-surface-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--biz-muted)]">
                        Not connected
                      </span>
                    )}
                  </div>
                  {ebayStatus?.connected && ebayStatus.username && (
                    <p className="text-xs text-[var(--biz-muted)]">
                      Connected as <span className="font-medium text-[var(--biz-text)]">{ebayStatus.username}</span>
                    </p>
                  )}
                  {ebayStatus?.connected && (
                    <div className="mt-1.5 space-y-0.5 text-xs text-[var(--biz-muted)]">
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
                        className={`${businessSecondaryButtonClass} px-3 py-1.5 text-xs`}
                      >
                        {ebayStatusLoading ? "Syncing..." : "Sync Inventory"}
                      </button>
                      <button
                        onClick={handleEbaySalesSync}
                        disabled={ebayStatusLoading}
                        className={`${businessSecondaryButtonClass} px-3 py-1.5 text-xs`}
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
                      className={`${businessPrimaryButtonClass} text-sm`}
                    >
                      {ebayConnectLoading ? "Connecting..." : "Connect eBay"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Current Plan */}
          {!isBusinessSettings && (
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
                        {paidPlanName}
                      </p>
                      <span
                        className={`px-2 py-1 text-xs font-medium rounded ${
                          isBusinessMember
                            ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400"
                            : "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                        }`}
                      >
                        {paidPlanBadge}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {paidPlanDescription}
                    </p>
                  </div>
                </div>

                <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    {`Your ${paidPlanBadge} features:`}
                  </p>
                  <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                    {paidPlanFeatures.map((feature) => (
                      <li key={feature} className="flex items-center gap-2">
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
                        {feature}
                      </li>
                    ))}
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
                    <li>• Business workspace included (1 user, +$5/seat)</li>
                  </ul>
                </div>
              </div>
            )}
          </div>
          )}

          {/* Password */}
          <div className={isBusinessSettings ? businessSectionClass : "bg-white/5 border border-white/15 rounded-2xl p-6 backdrop-blur-sm"}>
            <h2 className={`mb-4 text-lg font-semibold ${isBusinessSettings ? "text-[var(--biz-text)]" : "text-white"}`}>
              Password
            </h2>
            <p className={`mb-4 text-sm ${isBusinessSettings ? "text-[var(--biz-muted)]" : "text-white/70"}`}>
              Password changes are not currently supported. Contact support if
              you need to reset your password.
            </p>
          </div>

          {/* Session */}
          <div className={isBusinessSettings ? businessSectionClass : "bg-white/5 border border-white/15 rounded-2xl p-6 backdrop-blur-sm"}>
            <h2 className={`mb-4 text-lg font-semibold ${isBusinessSettings ? "text-[var(--biz-text)]" : "text-white"}`}>
              Session
            </h2>
            <button
              onClick={handleLogout}
              className={isBusinessSettings ? businessSecondaryButtonClass : "px-4 py-2 border border-white/30 text-white rounded-lg hover:bg-white/10 transition-colors"}
            >
              Log out
            </button>
          </div>

          {/* Danger Zone */}
          <div className={`rounded-2xl p-6 ${isBusinessSettings ? "border border-red-200 bg-red-50" : "border border-red-300/40 bg-red-500/10 backdrop-blur-sm"}`}>
            <h2 className={`mb-4 text-lg font-semibold ${isBusinessSettings ? "text-red-700" : "text-red-200"}`}>
              Danger Zone
            </h2>
            <p className={`mb-4 text-sm ${isBusinessSettings ? "text-red-700/80" : "text-white/75"}`}>
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
      </div>
      <PricingModal isOpen={pricingOpen} onClose={() => setPricingOpen(false)} />
    </>
  );
}

export default function SettingsPage() {
  return (
    <Suspense
      fallback={
        <>
          <div className="flex items-center justify-center min-h-screen">
            <div
              className="animate-spin rounded-full h-8 w-8 border-b-2"
              style={{ borderBottomColor: "var(--biz-primary, #2563EB)" }}
            />
          </div>
        </>
      }
    >
      <SettingsContent />
    </Suspense>
  );
}
