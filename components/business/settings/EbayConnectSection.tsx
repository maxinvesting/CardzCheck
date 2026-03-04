"use client";

import { useState, useEffect, useCallback } from "react";
import type { EbayAccountStatus } from "@/types";

export default function EbayConnectSection() {
  const [status, setStatus] = useState<EbayAccountStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/business/ebay/account");
      if (!res.ok) throw new Error("Failed to load eBay account status");
      const data: EbayAccountStatus = await res.json();
      setStatus(data);
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
    if (!confirm("Disconnect your eBay account? This will stop automatic order sync.")) return;
    try {
      setDisconnecting(true);
      const res = await fetch("/api/auth/ebay/disconnect", { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to disconnect");
      }
      setStatus({ connected: false, ebay_username: null, top_rated_seller: false, access_token_expires_at: null });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Disconnect failed");
    } finally {
      setDisconnecting(false);
    }
  }

  const isTokenExpiringSoon =
    status?.access_token_expires_at
      ? new Date(status.access_token_expires_at).getTime() - Date.now() < 5 * 60 * 1000
      : false;

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
              Connect to sync orders, import listings, and list cards directly from inventory
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
          <div className="rounded-lg bg-white/5 px-4 py-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-white/50">Seller ID</span>
              <span className="font-medium text-white">
                {status.ebay_username ?? "—"}
              </span>
            </div>
            <div className="mt-1.5 flex items-center justify-between">
              <span className="text-white/50">Seller tier</span>
              <span
                className={`text-xs font-semibold ${
                  status.top_rated_seller ? "text-yellow-400" : "text-white/60"
                }`}
              >
                {status.top_rated_seller ? "Top Rated Plus" : "Standard (13.25% FVF)"}
              </span>
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
        <div className="mt-4">
          <a
            href="/api/auth/ebay"
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500"
          >
            Connect eBay Account
          </a>
          <p className="mt-2 text-xs text-white/40">
            You&apos;ll be redirected to eBay to authorize CardzCheck. No listings will be
            created or changed during connection.
          </p>
        </div>
      )}

      {error && (
        <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</p>
      )}
    </div>
  );
}
