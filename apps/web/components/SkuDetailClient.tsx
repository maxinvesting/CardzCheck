"use client";

import { useEffect, useMemo, useState } from "react";
import { type Hex } from "viem";
import { getBrowserSupabase } from "@/lib/supabase";
import { getPublicClient } from "@/lib/chain";
import { pegOracleAbi } from "@/lib/contracts";
import { publicConfig } from "@/lib/env";
import { formatUsdc } from "@/lib/format";
import { type PegUpdateRow, type SoldCompRow, type SkuRow } from "@/lib/types";

type OracleState = {
  pegPrice: bigint;
  observedAt: bigint;
  nonce: bigint;
  halted: boolean;
  haltUntil: bigint;
};

function normalizeState(raw: unknown): OracleState {
  if (Array.isArray(raw)) {
    return {
      pegPrice: BigInt(raw[0] as string | number | bigint),
      observedAt: BigInt(raw[1] as string | number | bigint),
      nonce: BigInt(raw[2] as string | number | bigint),
      halted: Boolean(raw[3]),
      haltUntil: BigInt(raw[4] as string | number | bigint),
    };
  }

  const state = raw as OracleState;
  return state;
}

function buildPolylinePoints(updates: PegUpdateRow[]): string {
  if (updates.length <= 1) {
    return "";
  }

  const values = updates.map((u) => Number(u.peg_price));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;

  return updates
    .map((u, index) => {
      const x = (index / (updates.length - 1)) * 100;
      const y = 100 - ((Number(u.peg_price) - min) / span) * 100;
      return `${x},${y}`;
    })
    .join(" ");
}

export function SkuDetailClient({ skuId }: { skuId: string }) {
  const publicClient = useMemo(() => getPublicClient(), []);

  const [sku, setSku] = useState<SkuRow | null>(null);
  const [updates, setUpdates] = useState<PegUpdateRow[]>([]);
  const [comps, setComps] = useState<SoldCompRow[]>([]);
  const [oracleState, setOracleState] = useState<OracleState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const supabase = getBrowserSupabase();

        const [{ data: skuData, error: skuError }, { data: updateData, error: updateError }, { data: compData, error: compError }] =
          await Promise.all([
            supabase
              .from("skus")
              .select("id, sku_id, name, details, image_url, status, created_at")
              .eq("sku_id", skuId)
              .eq("status", "active")
              .maybeSingle(),
            supabase
              .from("peg_updates")
              .select(
                "id, sku_id, peg_price, method, n, window_seconds, sales_hash, observed_at, nonce, tx_hash, created_at"
              )
              .eq("sku_id", skuId)
              .order("observed_at", { ascending: true }),
            supabase
              .from("sold_comps")
              .select("id, sku_id, price_cents, sold_at, source, external_id, raw")
              .eq("sku_id", skuId)
              .order("sold_at", { ascending: false })
              .limit(25),
          ]);

        if (skuError) throw new Error(skuError.message);
        if (updateError) throw new Error(updateError.message);
        if (compError) throw new Error(compError.message);

        const chainStateRaw = await publicClient.readContract({
          address: publicConfig.pegOracleAddress,
          abi: pegOracleAbi,
          functionName: "getState",
          args: [skuId as Hex],
        });

        if (!active) return;
        setSku((skuData ?? null) as SkuRow | null);
        setUpdates((updateData ?? []) as PegUpdateRow[]);
        setComps((compData ?? []) as SoldCompRow[]);
        setOracleState(normalizeState(chainStateRaw));
      } catch (loadError) {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : "Failed to load SKU details");
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [publicClient, skuId]);

  const polyline = buildPolylinePoints(updates);

  return (
    <div className="space-y-4">
      {error ? <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-rose-700">{error}</div> : null}

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex gap-4">
          <img
            src={sku?.image_url ?? "https://placehold.co/160x220?text=Card"}
            alt={sku?.name ?? skuId}
            className="h-40 w-28 rounded-md object-cover"
          />
          <div>
            <h1 className="text-2xl font-semibold">{sku?.name ?? "Unknown SKU"}</h1>
            <p className="text-xs text-slate-500">{skuId}</p>
            <p className="mt-2 text-sm">
              On-chain peg: <span className="font-semibold">${formatUsdc(oracleState?.pegPrice ?? 0n)}</span>
            </p>
            <p className="text-sm">On-chain nonce: {oracleState?.nonce.toString() ?? "-"}</p>
            <p className="text-sm">
              Halted: {oracleState?.halted ? `yes (until ${oracleState?.haltUntil.toString()})` : "no"}
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-lg font-medium">Peg History</h2>
        {updates.length > 1 ? (
          <svg viewBox="0 0 100 100" className="h-48 w-full rounded-md bg-slate-50 p-2">
            <polyline fill="none" stroke="#4557d4" strokeWidth="2" points={polyline} />
          </svg>
        ) : (
          <p className="text-sm text-slate-600">Need at least two updates for a line chart.</p>
        )}

        <div className="mt-3 space-y-1 text-sm">
          {updates.map((update) => (
            <div key={update.id} className="rounded-md border border-slate-200 p-2">
              <span className="font-medium">${formatUsdc(BigInt(update.peg_price))}</span> at {new Date(update.observed_at).toLocaleString()} (nonce {update.nonce})
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-lg font-medium">Recent Sold Comps Used</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-600">
                <th className="px-2 py-2">Sold At</th>
                <th className="px-2 py-2">Price (USDC)</th>
                <th className="px-2 py-2">Source</th>
                <th className="px-2 py-2">External ID</th>
              </tr>
            </thead>
            <tbody>
              {comps.map((comp) => (
                <tr key={comp.id} className="border-b border-slate-100">
                  <td className="px-2 py-2">{new Date(comp.sold_at).toLocaleString()}</td>
                  <td className="px-2 py-2">${formatUsdc(BigInt(comp.price_cents))}</td>
                  <td className="px-2 py-2">{comp.source ?? "-"}</td>
                  <td className="px-2 py-2">{comp.external_id ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
