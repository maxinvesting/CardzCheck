"use client";

import { useState, useEffect, useCallback } from "react";
import type { EbayAccountStatus } from "@/types";

const STALE_THRESHOLD_HOURS = 2;

export default function EbayOrderSyncBanner() {
  const [status, setStatus] = useState<EbayAccountStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{
    new_sales_created: number;
    orders_processed: number;
    errors: string[];
  } | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    fetch("/api/business/ebay/account")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: EbayAccountStatus | null) => setStatus(data))
      .catch(() => null);
  }, []);

  const handleSync = useCallback(async () => {
    try {
      setSyncing(true);
      setSyncResult(null);
      const res = await fetch("/api/business/ebay/orders/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Sync failed");
      setSyncResult(data);
      // Refresh account status to update the last sync time
      const accountRes = await fetch("/api/business/ebay/account");
      if (accountRes.ok) setStatus(await accountRes.json());
    } catch (err) {
      setSyncResult({
        new_sales_created: 0,
        orders_processed: 0,
        errors: [err instanceof Error ? err.message : "Sync failed"],
      });
    } finally {
      setSyncing(false);
    }
  }, []);

  if (!status?.connected || dismissed) return null;

  const lastSync = status.access_token_expires_at
    ? new Date(status.access_token_expires_at)
    : null;
  const isStale =
    !lastSync ||
    Date.now() - lastSync.getTime() > STALE_THRESHOLD_HOURS * 60 * 60 * 1000;

  if (!isStale && !syncResult) return null;

  return (
    <div className="mb-4 rounded-xl border border-[#86b817]/20 bg-[#86b817]/5 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          {/* eBay mini badge */}
          <span className="shrink-0 text-xs font-extrabold tracking-tight">
            <span style={{ color: "#e43137" }}>e</span>
            <span style={{ color: "#0064d3" }}>B</span>
            <span style={{ color: "#f5af02" }}>a</span>
            <span style={{ color: "#86b817" }}>y</span>
          </span>
          {syncResult ? (
            <span className="text-sm text-white/70 truncate">
              {syncResult.errors.length > 0 ? (
                <span className="text-red-400">{syncResult.errors[0]}</span>
              ) : syncResult.new_sales_created > 0 ? (
                <>
                  <span className="font-semibold text-white">{syncResult.new_sales_created}</span>{" "}
                  new {syncResult.new_sales_created === 1 ? "sale" : "sales"} imported from eBay
                </>
              ) : (
                "eBay orders are up to date"
              )}
            </span>
          ) : (
            <span className="text-sm text-white/60">
              eBay orders may be out of sync
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleSync}
            disabled={syncing}
            className="rounded-lg bg-[#86b817]/20 px-3 py-1 text-xs font-semibold text-[#86b817] transition hover:bg-[#86b817]/30 disabled:opacity-50"
          >
            {syncing ? "Syncing…" : "Sync Now"}
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="text-white/30 transition hover:text-white/60 text-lg leading-none"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      </div>
    </div>
  );
}
