"use client";

import { useState, useEffect, useCallback } from "react";
import type { EbayAccountStatus } from "@/types";
import type { StoreTier } from "@/lib/business/EbayProfitEngine";
import { FVF_RATES } from "@/lib/business/EbayProfitEngine";

const STORE_TIER_OPTIONS: { value: StoreTier; label: string }[] = [
  { value: "none", label: "No Store" },
  { value: "starter", label: "Starter Store" },
  { value: "basic", label: "Basic Store" },
  { value: "premium", label: "Premium Store" },
  { value: "anchor", label: "Anchor Store" },
  { value: "enterprise", label: "Enterprise Store" },
];

function fvfRateForTier(tier: StoreTier): number {
  return tier === "none" || tier === "starter"
    ? FVF_RATES.NON_STORE
    : FVF_RATES.BASIC_PLUS;
}

function fvfLabel(tier: StoreTier): string {
  const pct = (fvfRateForTier(tier) * 100).toFixed(2);
  return `${pct}% FVF`;
}

export default function EbayConnectSection() {
  const [status, setStatus] = useState<EbayAccountStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Store tier editing state
  const [editingTier, setEditingTier] = useState(false);
  const [pendingTier, setPendingTier] = useState<StoreTier>("none");
  const [savingTier, setSavingTier] = useState(false);
  const [tierSaved, setTierSaved] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/business/ebay/account");
      if (!res.ok) throw new Error("Failed to load eBay account status");
      const data: EbayAccountStatus = await res.json();
      setStatus(data);
      setPendingTier(data.store_tier ?? "none");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();

    // Handle redirect-back messages from OAuth callback
    const params = new URLSearchParams(window.location.search);
    const ebayParam = params.get("ebay");
    if (ebayParam === "connected") {
      fetchStatus();
    } else if (ebayParam === "error") {
      const errMsg = params.get("error");
      setError(errMsg ? decodeURIComponent(errMsg) : "eBay connection failed");
    } else if (ebayParam === "denied") {
      setError("eBay connection was cancelled.");
    }
  }, [fetchStatus]);

  async function handleDisconnect() {
    if (
      !confirm(
        "Disconnect your eBay account? This will stop automatic order sync."
      )
    )
      return;
    try {
      setDisconnecting(true);
      const res = await fetch("/api/auth/ebay/disconnect", { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to disconnect");
      }
      setStatus({
        connected: false,
        ebay_username: null,
        top_rated_seller: false,
        access_token_expires_at: null,
        store_tier: status?.store_tier ?? "none",
        scopes: [],
      });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Disconnect failed");
    } finally {
      setDisconnecting(false);
    }
  }

  async function handleSaveTier() {
    try {
      setSavingTier(true);
      const res = await fetch("/api/business/ebay/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ store_tier: pendingTier }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to save store tier");
      }
      setStatus((prev) => (prev ? { ...prev, store_tier: pendingTier } : prev));
      setEditingTier(false);
      setTierSaved(true);
      setTimeout(() => setTierSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSavingTier(false);
    }
  }

  const isTokenExpiringSoon =
    status?.access_token_expires_at
      ? new Date(status.access_token_expires_at).getTime() - Date.now() <
        5 * 60 * 1000
      : false;

  const currentTier: StoreTier = status?.store_tier ?? "none";

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          {/* eBay logo mark */}
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10 text-base font-extrabold tracking-tight">
            <span style={{ color: "#e43137" }}>e</span>
            <span style={{ color: "#0064d3" }}>B</span>
            <span style={{ color: "#f5af02" }}>a</span>
            <span style={{ color: "#86b817" }}>y</span>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">eBay Account</h3>
            <p className="text-xs text-white/50">
              Connect to sync orders, import listings, and list cards directly
              from inventory
            </p>
          </div>
        </div>

        {/* Status badge */}
        {!loading && (
          <span
            className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
              status?.connected
                ? "bg-emerald-500/15 text-emerald-400"
                : "bg-white/10 text-white/40"
            }`}
          >
            {status?.connected ? "Connected" : "Not connected"}
          </span>
        )}
      </div>

      {loading ? (
        <div className="mt-4 h-5 w-32 animate-pulse rounded bg-white/10" />
      ) : status?.connected ? (
        <div className="mt-4 space-y-3">
          {/* Account info */}
          <div className="rounded-lg bg-white/5 px-4 py-3 text-sm space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-white/50">Seller ID</span>
              <span className="font-medium text-white">
                {status.ebay_username ?? "—"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-white/50">Seller badge</span>
              <span
                className={`text-xs font-semibold ${
                  status.top_rated_seller ? "text-yellow-400" : "text-white/60"
                }`}
              >
                {status.top_rated_seller ? "Top Rated Plus" : "Standard"}
              </span>
            </div>

            {/* Store tier row */}
            <div className="flex items-center justify-between pt-0.5">
              <span className="text-white/50">Store subscription</span>
              {editingTier ? (
                <div className="flex items-center gap-2">
                  <select
                    value={pendingTier}
                    onChange={(e) =>
                      setPendingTier(e.target.value as StoreTier)
                    }
                    className="rounded border border-gray-600 bg-gray-800 px-2 py-0.5 text-xs text-white focus:outline-none"
                  >
                    {STORE_TIER_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={handleSaveTier}
                    disabled={savingTier}
                    className="rounded bg-emerald-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
                  >
                    {savingTier ? "Saving…" : "Save"}
                  </button>
                  <button
                    onClick={() => {
                      setEditingTier(false);
                      setPendingTier(currentTier);
                    }}
                    className="text-xs text-white/40 hover:text-white/70"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-white/80">
                    {STORE_TIER_OPTIONS.find((o) => o.value === currentTier)
                      ?.label ?? "No Store"}
                    <span className="ml-1.5 text-white/40">
                      ({fvfLabel(currentTier)})
                    </span>
                  </span>
                  {tierSaved && (
                    <span className="text-xs text-emerald-400">Saved</span>
                  )}
                  <button
                    onClick={() => setEditingTier(true)}
                    className="text-[11px] text-white/30 hover:text-white/60 underline underline-offset-2"
                  >
                    Change
                  </button>
                </div>
              )}
            </div>

            {isTokenExpiringSoon && (
              <p className="mt-2 text-xs text-amber-400">
                Token expiring soon — reconnect to keep sync working
              </p>
            )}
          </div>

          <div className="flex gap-2">
            <a
              href="/api/auth/ebay"
              className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-white/70 transition hover:border-white/20 hover:text-white"
            >
              Reconnect
            </a>
            <button
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="rounded-lg border border-red-500/30 px-3 py-1.5 text-xs font-medium text-red-400 transition hover:border-red-500/50 hover:text-red-300 disabled:opacity-50"
            >
              {disconnecting ? "Disconnecting…" : "Disconnect"}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <a
            href="/api/auth/ebay"
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500"
          >
            Connect eBay Account
          </a>
          <p className="text-xs text-white/40">
            You&apos;ll be redirected to eBay to authorize this app. No
            listings will be created or changed during connection.
          </p>
        </div>
      )}

      {error && (
        <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
