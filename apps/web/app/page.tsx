"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAccount, useWriteContract } from "wagmi";
import { type Hex } from "viem";
import { getBrowserSupabase } from "@/lib/supabase";
import { getPublicClient } from "@/lib/chain";
import { publicConfig, zeroAddress } from "@/lib/env";
import { formatUsdc } from "@/lib/format";
import { inventoryVaultAbi, mockUsdcAbi, pegMarketAbi, pegOracleAbi } from "@/lib/contracts";
import { type SkuRow } from "@/lib/types";

type ChainSkuState = {
  pegPrice: bigint;
  observedAt: bigint;
  nonce: bigint;
  halted: boolean;
  haltUntil: bigint;
  inventory: bigint;
};

function normalizeState(raw: unknown): Omit<ChainSkuState, "inventory"> {
  if (Array.isArray(raw)) {
    return {
      pegPrice: BigInt(raw[0] as string | number | bigint),
      observedAt: BigInt(raw[1] as string | number | bigint),
      nonce: BigInt(raw[2] as string | number | bigint),
      halted: Boolean(raw[3]),
      haltUntil: BigInt(raw[4] as string | number | bigint),
    };
  }

  const state = raw as {
    pegPrice: bigint;
    observedAt: bigint;
    nonce: bigint;
    halted: boolean;
    haltUntil: bigint;
  };

  return {
    pegPrice: state.pegPrice,
    observedAt: state.observedAt,
    nonce: state.nonce,
    halted: state.halted,
    haltUntil: state.haltUntil,
  };
}

export default function MarketplacePage() {
  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const publicClient = useMemo(() => getPublicClient(), []);

  const [skus, setSkus] = useState<SkuRow[]>([]);
  const [chainStates, setChainStates] = useState<Record<string, ChainSkuState>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [qtyBySku, setQtyBySku] = useState<Record<string, string>>({});
  const [busySku, setBusySku] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const supabase = getBrowserSupabase();
      const { data, error: skuError } = await supabase
        .from("skus")
        .select("id, sku_id, name, details, image_url, status, created_at")
        .eq("status", "active")
        .order("created_at", { ascending: false });

      if (skuError) {
        throw new Error(skuError.message);
      }

      const rows = (data ?? []) as SkuRow[];
      setSkus(rows);

      const stateEntries = await Promise.all(
        rows.map(async (sku) => {
          const skuId = sku.sku_id as Hex;
          const stateRaw = await publicClient.readContract({
            address: publicConfig.pegOracleAddress,
            abi: pegOracleAbi,
            functionName: "getState",
            args: [skuId],
          });

          const state = normalizeState(stateRaw);
          const inventory = (await publicClient.readContract({
            address: publicConfig.inventoryVaultAddress,
            abi: inventoryVaultAbi,
            functionName: "balanceOf",
            args: [publicConfig.marketAddress, BigInt(skuId)],
          })) as bigint;

          return [sku.sku_id, { ...state, inventory }] as const;
        })
      );

      setChainStates(Object.fromEntries(stateEntries));
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "Failed to load marketplace";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [publicClient]);

  useEffect(() => {
    void load();
  }, [load]);

  const buySku = useCallback(
    async (skuId: Hex) => {
      if (!address) {
        setError("Connect wallet before buying");
        return;
      }

      const chainState = chainStates[skuId];
      if (!chainState) {
        setError("Missing chain state");
        return;
      }

      if (chainState.halted && chainState.haltUntil > BigInt(Math.floor(Date.now() / 1000))) {
        setError("SKU is currently halted");
        return;
      }

      const qty = Number(qtyBySku[skuId] ?? "1");
      if (!Number.isFinite(qty) || qty <= 0 || !Number.isInteger(qty)) {
        setError("Quantity must be a positive whole number");
        return;
      }

      const total = chainState.pegPrice * BigInt(qty);

      setBusySku(skuId);
      setStatus("Checking USDC allowance...");
      setError(null);

      try {
        const allowance = (await publicClient.readContract({
          address: publicConfig.usdcAddress,
          abi: mockUsdcAbi,
          functionName: "allowance",
          args: [address, publicConfig.marketAddress],
        })) as bigint;

        if (allowance < total) {
          setStatus("Approving USDC...");
          const approveTx = await writeContractAsync({
            address: publicConfig.usdcAddress,
            abi: mockUsdcAbi,
            functionName: "approve",
            args: [publicConfig.marketAddress, total],
          });
          await publicClient.waitForTransactionReceipt({ hash: approveTx });
        }

        setStatus("Submitting buy transaction...");
        const buyTx = await writeContractAsync({
          address: publicConfig.marketAddress,
          abi: pegMarketAbi,
          functionName: "buy",
          args: [skuId, BigInt(qty), total],
        });
        await publicClient.waitForTransactionReceipt({ hash: buyTx });

        setStatus(`Buy success: ${buyTx}`);
        await load();
      } catch (buyError) {
        const message = buyError instanceof Error ? buyError.message : "Buy failed";
        setError(message);
      } finally {
        setBusySku(null);
      }
    },
    [address, chainStates, load, publicClient, qtyBySku, writeContractAsync]
  );

  if (
    publicConfig.marketAddress === zeroAddress ||
    publicConfig.pegOracleAddress === zeroAddress ||
    publicConfig.inventoryVaultAddress === zeroAddress ||
    publicConfig.usdcAddress === zeroAddress
  ) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900">
        Configure contract addresses in `apps/web/.env.local` first.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Marketplace</h1>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
        >
          Refresh
        </button>
      </div>

      {error ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-rose-700">{error}</div>
      ) : null}
      {status ? (
        <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-blue-800">{status}</div>
      ) : null}

      {loading ? <p className="text-slate-600">Loading SKUs...</p> : null}

      <div className="grid gap-4 md:grid-cols-2">
        {skus.map((sku) => {
          const chainState = chainStates[sku.sku_id];
          const qtyValue = qtyBySku[sku.sku_id] ?? "1";
          const halted = Boolean(
            chainState?.halted && chainState.haltUntil > BigInt(Math.floor(Date.now() / 1000))
          );
          const pegPrice = chainState?.pegPrice ?? 0n;

          return (
            <article key={sku.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex gap-4">
                <img
                  src={sku.image_url ?? "https://placehold.co/160x220?text=Card"}
                  alt={sku.name}
                  className="h-36 w-24 rounded-md object-cover"
                />
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-lg font-medium">{sku.name}</h2>
                  <p className="text-xs text-slate-500">{sku.sku_id}</p>
                  <p className="mt-2 text-sm">
                    Peg: <span className="font-semibold">${formatUsdc(pegPrice)} USDC</span>
                  </p>
                  <p className="text-sm">Inventory: {chainState?.inventory.toString() ?? "-"}</p>
                  <p className="text-sm">Nonce: {chainState?.nonce.toString() ?? "-"}</p>
                  {halted ? (
                    <p className="text-sm font-medium text-rose-700">Halted until {chainState?.haltUntil.toString()}</p>
                  ) : null}
                  <Link href={`/sku/${sku.sku_id}`} className="mt-2 inline-block text-sm text-brand-700 underline">
                    View SKU details
                  </Link>
                </div>
              </div>

              <div className="mt-4 flex items-center gap-2">
                <input
                  value={qtyValue}
                  onChange={(event) =>
                    setQtyBySku((prev) => ({
                      ...prev,
                      [sku.sku_id]: event.target.value,
                    }))
                  }
                  className="w-24 rounded-md border border-slate-300 px-3 py-2 text-sm"
                  type="number"
                  min={1}
                  step={1}
                />
                <button
                  className="rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                  disabled={busySku === sku.sku_id || halted || pegPrice === 0n}
                  onClick={() => void buySku(sku.sku_id as Hex)}
                  type="button"
                >
                  {busySku === sku.sku_id ? "Buying..." : "Buy at Peg"}
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {!loading && skus.length === 0 ? (
        <p className="rounded-md border border-slate-200 bg-white p-4 text-slate-600">
          No SKUs yet. Use Admin to create one.
        </p>
      ) : null}
    </div>
  );
}
